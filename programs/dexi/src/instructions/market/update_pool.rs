use anchor_lang::prelude::*;
use crate::constants::*;
use crate::error::DexiError;
use crate::state::*;

#[derive(Accounts)]
pub struct UpdatePool<'info> {
    #[account(seeds = [ADMIN_SEED], bump, has_one = admin @ crate::error::DexiError::NotAdmin)]
    pub config: Account<'info, AdminConfig>,
    #[account(mut, seeds = [POOL_SEED, pool.mint.as_ref()], bump)]
    pub pool: Account<'info, AthletePool>,
    #[account(mut)]
    pub admin: Signer<'info>,
}

impl<'info> UpdatePool<'info> {
    pub fn update(
        &mut self,
        name: Option<String>,
        role: Option<AthleteRole>,
        enabled: Option<bool>,
    ) -> Result<()> {
        let pool = &mut self.pool;

        if let Some(name) = name {
            require!(name.len() <= MAX_NAME_LEN, DexiError::NameTooLong);
            pool.name = name;
        }
        if let Some(role) = role {
            pool.role = role;
        }
        if let Some(enabled) = enabled {
            pool.enabled = enabled;
        }

        Ok(())
    }
}
