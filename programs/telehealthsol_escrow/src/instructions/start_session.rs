use anchor_lang::prelude::*;

use anchor_spl::{
  associated_token::AssociatedToken,
  token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked},
};

use crate::state::Escrow;
use crate::errors::EscrowError;

#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct StartSession<'info> {
  #[account(mut)]
  pub patient: Signer<'info>,
  /// CHECK: This is not dangerous because we don't read or write from this account
  pub platform: UncheckedAccount<'info>,
  #[account(
    init,
    payer = patient,
    space = Escrow::INIT_SPACE + Escrow::DISCRIMINATOR.len(),
    seeds = [b"session", patient.key().as_ref(), seed.to_le_bytes().as_ref()],
    bump,
  )]
  pub escrow: Account<'info, Escrow>,

  #[account(
    mint::token_program = token_program,
  )]
  pub mint: InterfaceAccount<'info, Mint>,
  #[account(
    mut,
    associated_token::mint = mint,
    associated_token::authority = patient,
    associated_token::token_program = token_program,
  )]
  pub patient_ata: InterfaceAccount<'info, TokenAccount>,
  #[account(
    init,
    payer = patient,
    associated_token::mint = mint,
    associated_token::authority = escrow,
    associated_token::token_program = token_program,
  )]
  pub vault: InterfaceAccount<'info, TokenAccount>,

  /// Programs
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Interface<'info, TokenInterface>,
  pub system_program: Program<'info, System>,
}

impl <'info> StartSession<'info> {
  /// Create the escrow account data
  fn populate_escrow(&mut self, seed: u64, bump: u8) -> Result<()> {
    self.escrow.set_inner(Escrow {
      seed,
      patient: self.patient.key(),
      platform: self.platform.key(),
      mint: self.mint.key(),
      bump,
    });

    Ok(())
  }

  /// Transfer the session amount from the patient to the vault
  fn transfer_to_vault(&self, session_amount: u64) -> Result<()> {
    transfer_checked(
      CpiContext::new(
        self.token_program.to_account_info(),
        TransferChecked {
          from: self.patient_ata.to_account_info(),
          to: self.vault.to_account_info(),
          authority: self.patient.to_account_info(),
          mint: self.mint.to_account_info(),
        },
      ),
      session_amount,
      self.mint.decimals,
    )?;

    Ok(())
  }
}

pub fn handler(
  ctx: Context<StartSession>,
  seed: u64,
  session_amount: u64,
) -> Result<()> {
  // Validate inputs
  require_gt!(session_amount, 0, EscrowError::InvalidSessionAmount);

  // Populate the escrow account data
  ctx.accounts.populate_escrow(seed, ctx.bumps.escrow)?;

  // Transfer the session amount from the patient to the vault
  ctx.accounts.transfer_to_vault(session_amount)?;

  Ok(())
}