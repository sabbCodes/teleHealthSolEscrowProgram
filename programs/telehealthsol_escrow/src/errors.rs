use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("The provided seed does not match the expected seed.")]
    InvalidSeed,
    #[msg("The session amount must be greater than zero.")]
    InvalidSessionAmount,
    #[msg("Insufficient funds for the transaction.")]
    InsufficientFunds,
    #[msg("Invalid mint address provided.")]
    InvalidMint,
    #[msg("Invalid patient address provided.")]
    InvalidPatient,
    #[msg("Invalid doctor address provided.")]
    InvalidDoctor,
    #[msg("Invalid platform fee percentage.")]
    InvalidPlatformFee,
}