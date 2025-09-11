use anchor_lang::prelude::*;

mod state;
mod errors;
mod instructions;
use instructions::*;

declare_id!("2UyrkxG28g7hHcsy15d1mEUc7KcDZ3zcnvS8fHsrks1q");

#[program]
pub mod telehealthsol_escrow {
    use super::*;

    #[instruction(discriminator = 0)]
    pub fn start_session(
        ctx: Context<StartSession>,
        seed: u64,
        session_amount: u64,
    ) -> Result<()> {
        instructions::start_session::handler(ctx, seed, session_amount)
    }

    #[instruction(discriminator = 1)]
    pub fn complete_session(
        ctx: Context<CompleteSession>,
    ) -> Result<()> {
        instructions::complete_session::handler(ctx)
    }

    #[instruction(discriminator = 2)]
    pub fn cancel_session(
        ctx: Context<CancelSession>,
    ) -> Result<()> {
        instructions::cancel_session::handler(ctx)
    }
}

