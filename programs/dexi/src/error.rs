use anchor_lang::prelude::*;
use constant_product_curve::CurveError;

#[error_code]
pub enum DexiError {
    #[msg("Only admin can perform this action")]
    NotAdmin,

    #[msg("Pool is disabled")]
    PoolDisabled,

    #[msg("Arithmetic overflow or underflow")]
    ArithmeticError,

    #[msg("Insufficient liquidity in pool")]
    InsufficientLiquidity,

    #[msg("Contest is not open for entries")]
    ContestNotOpen,

    #[msg("Entry deadline has passed")]
    EntryDeadlinePassed,

    #[msg("Invalid lineup: must match role requirements")]
    InvalidLineup,

    #[msg("Invalid token mint for this slot")]
    InvalidMint,

    #[msg("Contest already locked")]
    ContestAlreadyLocked,

    #[msg("Contest not locked")]
    ContestNotLocked,

    #[msg("Contest already settled")]
    AlreadySettled,

    #[msg("Contest not settled")]
    NotSettled,

    #[msg("Prize already claimed")]
    AlreadyClaimed,

    #[msg("No prize for this rank")]
    NoPrize,

    #[msg("Invalid contest status")]
    InvalidContestStatus,

    #[msg("Name too long")]
    NameTooLong,

    #[msg("Invalid prize split configuration")]
    InvalidPrizeSplit,

    #[msg("No score recorded")]
    NoScore,

    #[msg("Slippage exceeded")]
    SlippageExceeded,

    #[msg("Overflow")]
    Overflow,

    #[msg("Underflow")]
    Underflow,

    #[msg("Invalid fee")]
    InvalidFee,

    #[msg("Invalid amount")]
    InvalidAmount,
}

impl From<CurveError> for DexiError {
    fn from(error: CurveError) -> Self {
        match error {
            CurveError::Overflow => DexiError::Overflow,
            CurveError::Underflow => DexiError::Underflow,
            CurveError::InvalidFeeAmount => DexiError::InvalidFee,
            CurveError::InvalidPrecision => DexiError::ArithmeticError,
            CurveError::InsufficientBalance => DexiError::InsufficientLiquidity,
            CurveError::ZeroBalance => DexiError::InsufficientLiquidity,
            CurveError::SlippageLimitExceeded => DexiError::SlippageExceeded,
        }
    }
}
