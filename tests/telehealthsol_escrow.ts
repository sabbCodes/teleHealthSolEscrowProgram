import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

import { TelehealthsolEscrow } from "../target/types/telehealthsol_escrow";

// Standard SPL Associated Token Program ID
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

describe("telehealthsol_escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .TelehealthsolEscrow as Program<TelehealthsolEscrow>;
  const payer = (provider.wallet as anchor.Wallet).payer;
  const connection = provider.connection;

  // Create keypairs for all actors
  const patient = anchor.web3.Keypair.generate();
  const platform = anchor.web3.Keypair.generate();
  const doctor = anchor.web3.Keypair.generate();

  let mint: anchor.web3.PublicKey;
  let patientAta: anchor.web3.PublicKey;
  let doctorAta: anchor.web3.PublicKey;
  let platformAta: anchor.web3.PublicKey;
  let escrow: anchor.web3.PublicKey;
  let vault: anchor.web3.PublicKey;
  let seed: BN;

  before("Setup accounts and mint", async () => {
    // Airdrop SOL to all participants for rent
    const signatures = await Promise.all([
      connection.requestAirdrop(patient.publicKey, 2 * LAMPORTS_PER_SOL),
      connection.requestAirdrop(doctor.publicKey, 2 * LAMPORTS_PER_SOL),
      connection.requestAirdrop(platform.publicKey, 2 * LAMPORTS_PER_SOL),
    ]);
    await Promise.all(
      signatures.map((sig) => connection.confirmTransaction(sig))
    );

    // Create token mint
    mint = await createMint(
      connection,
      payer,
      payer.publicKey,
      null,
      6, // decimals
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    // Create ATAs for all participants
    patientAta = await createAssociatedTokenAccount(
      connection,
      payer,
      mint,
      patient.publicKey,
      undefined,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    doctorAta = await createAssociatedTokenAccount(
      connection,
      payer,
      mint,
      doctor.publicKey,
      undefined,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    platformAta = await createAssociatedTokenAccount(
      connection,
      payer,
      mint,
      platform.publicKey,
      undefined,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Mint initial tokens to patient
    await mintTo(
      connection,
      payer,
      mint,
      patientAta,
      payer,
      1000000000, // 1000 tokens
      [],
      undefined,
      TOKEN_PROGRAM_ID
    );
  });

  it("Starts session!", async () => {
    seed = new BN(Date.now());
    const sessionAmount = new BN(1_000_000); // 1 token

    // Derive the escrow PDA
    [escrow] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("session"),
        patient.publicKey.toBuffer(),
        seed.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    // Derive the vault ATA
    vault = getAssociatedTokenAddressSync(
      mint,
      escrow,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const tx = await program.methods
      .startSession(seed, sessionAmount)
      .accounts({
        patient: patient.publicKey,
        platform: platform.publicKey,
        escrow,
        mint,
        patientAta,
        vault,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([patient])
      .rpc();

    const escrowAccount = await program.account.escrow.fetch(escrow);
    console.log("\nEscrow Account Data:", escrowAccount);
  });

  it("Completes session and splits fee successfully!", async () => {
    const tx = await program.methods
      .completeSession()
      .accounts({
        doctor: doctor.publicKey,
        patient: patient.publicKey,
        platform: platform.publicKey,
        escrow,
        mint,
        vault,
        doctorAta,
        platformAta,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([doctor])
      .rpc();

    console.log("\nSession completed with tx:", tx);

    //Verify the tokens were transferred correctly
    const doctorBalance = await connection.getTokenAccountBalance(doctorAta);
    const platformBalance = await connection.getTokenAccountBalance(
      platformAta
    );

    console.log("\nDoctor balance:", doctorBalance.value.uiAmount);
    console.log("Platform balance:", platformBalance.value.uiAmount);

    // Doctor should have 90% of the tokens (0.9 tokens)
    assert.equal(
      doctorBalance.value.uiAmount,
      0.9,
      "Expected 0.9 tokens for doctor"
    );
    // Platform should have 10% of the tokens (0.1 tokens)
    assert.equal(
      platformBalance.value.uiAmount,
      0.1,
      "Expected 0.1 tokens for platform"
    );
  });

  it("Cancels session and splits fee between patient and platform", async () => {
    // Start a new session
    seed = new BN(Date.now());
    const sessionAmount = new BN(1_000_000); // 1 token

    [escrow] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("session"),
        patient.publicKey.toBuffer(),
        seed.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    vault = getAssociatedTokenAddressSync(
      mint,
      escrow,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Initialize escrow for this session and fund the vault
    await program.methods
      .startSession(seed, sessionAmount)
      .accounts({
        patient: patient.publicKey,
        platform: platform.publicKey,
        escrow,
        mint,
        patientAta,
        vault,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([patient])
      .rpc();

    // Get balances after starting session (baseline for cancel assertions)
    const baselinePatientBalance = await connection.getTokenAccountBalance(
      patientAta
    );
    const baselinePlatformBalance = await connection.getTokenAccountBalance(
      platformAta
    );

    // Cancel the session
    const tx = await program.methods
      .cancelSession()
      .accounts({
        patient: patient.publicKey,
        platform: platform.publicKey,
        escrow,
        mint,
        vault,
        patientAta,
        platformAta,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([patient])
      .rpc();

    console.log("\nSession canceled with tx:", tx);

    // Verify funds split correctly (relative to baseline after start)
    const finalPatientBalance = await connection.getTokenAccountBalance(
      patientAta
    );
    const finalPlatformBalance = await connection.getTokenAccountBalance(
      platformAta
    );

    console.log("\nPatient final balance:", finalPatientBalance.value.uiAmount);
    console.log("Platform final balance:", finalPlatformBalance.value.uiAmount);

    // Platform should have received ~10% (allow tiny FP tolerance)
    assert.approximately(
      finalPlatformBalance.value.uiAmount -
        baselinePlatformBalance.value.uiAmount,
      0.1,
      1e-9,
      "Platform should have received ~0.1 tokens"
    );

    // Patient should have received ~90% (allow tiny FP tolerance)
    assert.approximately(
      finalPatientBalance.value.uiAmount - baselinePatientBalance.value.uiAmount,
      0.9,
      1e-9,
      "Patient should have received ~0.9 tokens back"
    );
  });
});
