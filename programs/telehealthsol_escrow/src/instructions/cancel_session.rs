use anchor_lang::prelude::*;

use anchor_spl::{
  associated_token::AssociatedToken,
  token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, CloseAccount, close_account, transfer_checked},
};

use crate::state::Escrow;
use crate::errors::EscrowError;

#[derive(Accounts)]
pub struct CancelSession<'info> {
  #[account(mut)]
  pub patient: Signer<'info>,
  #[account(mut)]
  pub platform: SystemAccount<'info>,
  #[account(
    mut,
    close = patient,
    seeds = [b"session", patient.key().as_ref(), escrow.seed.to_le_bytes().as_ref()],
    bump = escrow.bump,
    has_one = patient @ EscrowError::InvalidPatient,
    has_one = mint @ EscrowError::InvalidMint,
  )]
  pub escrow: Box<Account<'info, Escrow>>,

  /// Token Accounts
  pub mint: Box<InterfaceAccount<'info, Mint>>,
  #[account(
    mut,
    associated_token::mint = mint,
    associated_token::authority = escrow,
    associated_token::token_program = token_program,
  )]
  pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = patient,
    associated_token::mint = mint,
    associated_token::authority = patient,
    associated_token::token_program = token_program,
  )]
  pub patient_ata: Box<InterfaceAccount<'info, TokenAccount>>,

  /// Programs
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Interface<'info, TokenInterface>,
  pub system_program: Program<'info, System>,
}

impl <'info> CancelSession<'info> {
  fn split_payment_and_close_vault(&self) -> Result<()> {
    // Split the payment between patient and platform (90% to patient, 10% to platform)

    // Calculate platform fee (10% of total amount)
    let platform_fee_amount: u64 = (10u128)
        .checked_mul(self.vault.amount as u128)
        .unwrap()
        .checked_div(100)
        .unwrap() as u64;

    // Calculate patient fee (remaining 90%)
    let patient_fee: u64 = self.vault.amount
        .checked_sub(platform_fee_amount)
        .unwrap();

    // Create the signer seeds
    let signer_seeds: [&[&[u8]]; 1] = [&[
      b"session",
      self.patient.to_account_info().key.as_ref(),
      &self.escrow.seed.to_le_bytes()[..],
      &[self.escrow.bump],
    ]];

    // Transfer the platform fee amount to the platform account
    transfer_checked(
      CpiContext::new_with_signer(
        self.token_program.to_account_info(),
        TransferChecked {
          from: self.vault.to_account_info(),
          to: self.platform.to_account_info(),
          authority: self.escrow.to_account_info(),
          mint: self.mint.to_account_info(),
        },
        &signer_seeds,
      ),
      platform_fee_amount,
      self.mint.decimals,
    )?;

    // Transfer the patient amount to the doctor account
    transfer_checked(
      CpiContext::new_with_signer(
        self.token_program.to_account_info(),
        TransferChecked {
          from: self.vault.to_account_info(),
          to: self.patient_ata.to_account_info(),
          authority: self.escrow.to_account_info(),
          mint: self.mint.to_account_info(),
        },
        &signer_seeds,
      ),
      patient_fee,
      self.mint.decimals,
    )?;

    // Close the vault account
    close_account(
      CpiContext::new_with_signer(
        self.token_program.to_account_info(),
        CloseAccount {
          account: self.vault.to_account_info(),
          destination: self.patient.to_account_info(),
          authority: self.escrow.to_account_info(),
        },
        &signer_seeds,
      ),
    )?;

    Ok(())
  }
}

pub fn handler(
  ctx: Context<CancelSession>,
) -> Result<()> {
  ctx.accounts.split_payment_and_close_vault()?;

  Ok(())
}