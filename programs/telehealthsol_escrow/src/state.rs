use anchor_lang::prelude::*;

#[derive(InitSpace)]
#[account(discriminator = 1)]
pub struct Escrow {
  pub seed: u64,
  pub patient: Pubkey,
  pub platform: Pubkey,
  pub mint: Pubkey,
  pub bump: u8,
}