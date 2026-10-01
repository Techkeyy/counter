use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};

// Program State Definitions
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum DuelStatus {
    AcceptingStakes,
    BackingClosed,
    ResolvedSideA,
    ResolvedSideB,
    Cancelled,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct DuelAccount {
    pub is_initialized: bool,
    pub resolver_authority: Pubkey,
    pub token_mint: Pubkey,
    pub terms_hash: [u8; 32],
    pub captain_a: Pubkey,
    pub captain_b: Pubkey,
    pub side_a_total: u64,
    pub side_b_total: u64,
    pub cutoff_ts: i64,
    pub resolution_ts: i64,
    pub status: DuelStatus,
    pub bump: u8,
    pub vault_bump: u8,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct PositionAccount {
    pub is_initialized: bool,
    pub duel: Pubkey,
    pub user: Pubkey,
    pub side: u8, // 1 for Side A, 2 for Side B
    pub stake_amount: u64,
    pub claimed: bool,
    pub bump: u8,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum CounterInstruction {
    /// 0: Initialize Duel & Vault PDA
    InitializeDuel {
        duel_id: [u8; 16],
        cutoff_ts: i64,
        resolution_ts: i64,
        terms_hash: [u8; 32],
        captain_a: Pubkey,
        captain_b: Pubkey,
        duel_bump: u8,
        vault_bump: u8,
    },
    /// 1: Deposit Stake
    DepositStake {
        side: u8,
        amount: u64,
        position_bump: u8,
    },
    /// 2: Resolve Duel
    ResolveDuel {
        winning_side: u8, // 1 for A, 2 for B, 3 for Cancel
    },
    /// 3: Claim Payout
    ClaimPayout {
        duel_id: [u8; 16],
    },
}

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = CounterInstruction::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    match instruction {
        CounterInstruction::InitializeDuel {
            duel_id,
            cutoff_ts,
            resolution_ts,
            terms_hash,
            captain_a,
            captain_b,
            duel_bump,
            vault_bump,
        } => {
            msg!("Instruction: InitializeDuel");
            process_initialize_duel(
                program_id,
                accounts,
                duel_id,
                cutoff_ts,
                resolution_ts,
                terms_hash,
                captain_a,
                captain_b,
                duel_bump,
                vault_bump,
            )
        }
        CounterInstruction::DepositStake {
            side,
            amount,
            position_bump,
        } => {
            msg!("Instruction: DepositStake (side: {}, amount: {})", side, amount);
            process_deposit_stake(program_id, accounts, side, amount, position_bump)
        }
        CounterInstruction::ResolveDuel { winning_side } => {
            msg!("Instruction: ResolveDuel (winning_side: {})", winning_side);
            process_resolve_duel(program_id, accounts, winning_side)
        }
        CounterInstruction::ClaimPayout { duel_id } => {
            msg!("Instruction: ClaimPayout");
            process_claim_payout(program_id, accounts, duel_id)
        }
    }
}

fn process_initialize_duel(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    duel_id: [u8; 16],
    cutoff_ts: i64,
    resolution_ts: i64,
    terms_hash: [u8; 32],
    captain_a: Pubkey,
    captain_b: Pubkey,
    duel_bump: u8,
    vault_bump: u8,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let payer = next_account_info(account_info_iter)?;
    let duel_account = next_account_info(account_info_iter)?;
    let resolver_authority = next_account_info(account_info_iter)?;
    let token_mint = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    if !payer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let expected_duel_pda = Pubkey::create_program_address(
        &[b"duel", &duel_id, &[duel_bump]],
        program_id,
    )?;
    if duel_account.key != &expected_duel_pda {
        return Err(ProgramError::InvalidSeeds);
    }

    let duel_data = DuelAccount {
        is_initialized: true,
        resolver_authority: *resolver_authority.key,
        token_mint: *token_mint.key,
        terms_hash,
        captain_a,
        captain_b,
        side_a_total: 0,
        side_b_total: 0,
        cutoff_ts,
        resolution_ts,
        status: DuelStatus::AcceptingStakes,
        bump: duel_bump,
        vault_bump,
    };

    let space = duel_data.try_to_vec()?.len();
    let rent = Rent::get()?;
    let rent_lamports = rent.minimum_balance(space);

    invoke_signed(
        &system_instruction::create_account(
            payer.key,
            duel_account.key,
            rent_lamports,
            space as u64,
            program_id,
        ),
        &[payer.clone(), duel_account.clone(), system_program.clone()],
        &[&[b"duel", &duel_id, &[duel_bump]]],
    )?;

    duel_data.serialize(&mut *duel_account.data.borrow_mut())?;
    msg!("Duel account initialized successfully!");
    Ok(())
}

fn process_deposit_stake(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    side: u8,
    amount: u64,
    position_bump: u8,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let user = next_account_info(account_info_iter)?;
    let duel_account = next_account_info(account_info_iter)?;
    let position_account = next_account_info(account_info_iter)?;
    let user_token_account = next_account_info(account_info_iter)?;
    let vault_token_account = next_account_info(account_info_iter)?;
    let token_program = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    if !user.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut duel = DuelAccount::try_from_slice(&duel_account.data.borrow())?;
    if !duel.is_initialized {
        return Err(ProgramError::UninitializedAccount);
    }

    let clock = Clock::get()?;
    if clock.unix_timestamp >= duel.cutoff_ts {
        msg!("Staking cutoff reached: timestamp >= cutoff_ts");
        return Err(ProgramError::Custom(101)); // StakingClosed
    }

    if duel.status != DuelStatus::AcceptingStakes {
        return Err(ProgramError::Custom(102)); // InvalidStatus
    }

    // Verify Position PDA
    let expected_pos_pda = Pubkey::create_program_address(
        &[b"position", duel_account.key.as_ref(), user.key.as_ref(), &[position_bump]],
        program_id,
    )?;
    if position_account.key != &expected_pos_pda {
        return Err(ProgramError::InvalidSeeds);
    }

    // Transfer SPL tokens from user to vault
    let transfer_ix = spl_token::instruction::transfer(
        token_program.key,
        user_token_account.key,
        vault_token_account.key,
        user.key,
        &[],
        amount,
    )?;
    invoke(
        &transfer_ix,
        &[
            user_token_account.clone(),
            vault_token_account.clone(),
            user.clone(),
            token_program.clone(),
        ],
    )?;

    // Create or update Position PDA
    if position_account.data_is_empty() {
        let pos_data = PositionAccount {
            is_initialized: true,
            duel: *duel_account.key,
            user: *user.key,
            side,
            stake_amount: amount,
            claimed: false,
            bump: position_bump,
        };
        let space = pos_data.try_to_vec()?.len();
        let rent = Rent::get()?;
        let rent_lamports = rent.minimum_balance(space);

        invoke_signed(
            &system_instruction::create_account(
                user.key,
                position_account.key,
                rent_lamports,
                space as u64,
                program_id,
            ),
            &[user.clone(), position_account.clone(), system_program.clone()],
            &[&[b"position", duel_account.key.as_ref(), user.key.as_ref(), &[position_bump]]],
        )?;
        pos_data.serialize(&mut *position_account.data.borrow_mut())?;
    } else {
        let mut pos = PositionAccount::try_from_slice(&position_account.data.borrow())?;
        if pos.side != side {
            msg!("Cannot switch sides in an active Duel");
            return Err(ProgramError::Custom(103)); // SideMismatch
        }
        pos.stake_amount = pos.stake_amount.checked_add(amount).ok_or(ProgramError::ArithmeticOverflow)?;
        pos.serialize(&mut *position_account.data.borrow_mut())?;
    }

    if side == 1 {
        duel.side_a_total = duel.side_a_total.checked_add(amount).ok_or(ProgramError::ArithmeticOverflow)?;
    } else if side == 2 {
        duel.side_b_total = duel.side_b_total.checked_add(amount).ok_or(ProgramError::ArithmeticOverflow)?;
    } else {
        return Err(ProgramError::InvalidArgument);
    }

    duel.serialize(&mut *duel_account.data.borrow_mut())?;
    msg!("Stake deposited. Side A Total: {}, Side B Total: {}", duel.side_a_total, duel.side_b_total);
    Ok(())
}

fn process_resolve_duel(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    winning_side: u8,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let resolver_authority = next_account_info(account_info_iter)?;
    let duel_account = next_account_info(account_info_iter)?;

    if !resolver_authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut duel = DuelAccount::try_from_slice(&duel_account.data.borrow())?;
    if &duel.resolver_authority != resolver_authority.key {
        msg!("Unauthorized resolver signer");
        return Err(ProgramError::Custom(104)); // UnauthorizedResolver
    }

    // Terminal-state invariant (HARD): a duel that reached ResolvedSideA,
    // ResolvedSideB, or Cancelled can never change state again. Only open
    // duels (AcceptingStakes / BackingClosed) may resolve.
    if duel.status != DuelStatus::AcceptingStakes && duel.status != DuelStatus::BackingClosed {
        msg!("Duel is already in a terminal state");
        return Err(ProgramError::Custom(109)); // AlreadyResolved
    }

    // Resolution-timing invariant (HARD): no resolution before the agreed
    // on-chain resolution timestamp. Backend mutual-deadline policy may add
    // further delay, never less.
    let clock = Clock::get()?;
    if clock.unix_timestamp < duel.resolution_ts {
        msg!("Resolution attempted before agreed resolution time");
        return Err(ProgramError::Custom(110)); // TooEarly
    }

    match winning_side {
        1 => duel.status = DuelStatus::ResolvedSideA,
        2 => duel.status = DuelStatus::ResolvedSideB,
        3 => duel.status = DuelStatus::Cancelled,
        _ => return Err(ProgramError::InvalidArgument),
    }

    duel.serialize(&mut *duel_account.data.borrow_mut())?;
    msg!("Duel resolved successfully to state: {:?}", duel.status);
    Ok(())
}

fn process_claim_payout(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    _duel_id: [u8; 16],
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let user = next_account_info(account_info_iter)?;
    let duel_account = next_account_info(account_info_iter)?;
    let position_account = next_account_info(account_info_iter)?;
    let user_token_account = next_account_info(account_info_iter)?;
    let vault_token_account = next_account_info(account_info_iter)?;
    let vault_pda = next_account_info(account_info_iter)?;
    let token_program = next_account_info(account_info_iter)?;

    if !user.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let duel = DuelAccount::try_from_slice(&duel_account.data.borrow())?;
    let mut position = PositionAccount::try_from_slice(&position_account.data.borrow())?;

    if position.user != *user.key || position.duel != *duel_account.key {
        return Err(ProgramError::Custom(105)); // PositionUserMismatch
    }

    if position.claimed {
        msg!("Position already claimed");
        return Err(ProgramError::Custom(106)); // AlreadyClaimed
    }

    // Verify Vault PDA
    let expected_vault_pda = Pubkey::create_program_address(
        &[b"vault", duel_account.key.as_ref(), &[duel.vault_bump]],
        program_id,
    )?;
    if vault_pda.key != &expected_vault_pda {
        return Err(ProgramError::InvalidSeeds);
    }

    let payout_amount: u64 = match duel.status {
        DuelStatus::ResolvedSideA => {
            if position.side != 1 {
                msg!("Losing position cannot claim winning payout");
                return Err(ProgramError::Custom(107)); // InvalidPositionSide
            }
            let losing_pool_share = (position.stake_amount as u128)
                .checked_mul(duel.side_b_total as u128)
                .ok_or(ProgramError::ArithmeticOverflow)?
                .checked_div(duel.side_a_total as u128)
                .ok_or(ProgramError::ArithmeticOverflow)? as u64;
            position.stake_amount.checked_add(losing_pool_share).ok_or(ProgramError::ArithmeticOverflow)?
        }
        DuelStatus::ResolvedSideB => {
            if position.side != 2 {
                msg!("Losing position cannot claim winning payout");
                return Err(ProgramError::Custom(107)); // InvalidPositionSide
            }
            let losing_pool_share = (position.stake_amount as u128)
                .checked_mul(duel.side_a_total as u128)
                .ok_or(ProgramError::ArithmeticOverflow)?
                .checked_div(duel.side_b_total as u128)
                .ok_or(ProgramError::ArithmeticOverflow)? as u64;
            position.stake_amount.checked_add(losing_pool_share).ok_or(ProgramError::ArithmeticOverflow)?
        }
        DuelStatus::Cancelled => {
            position.stake_amount
        }
        _ => {
            msg!("Duel is not in a claimable state");
            return Err(ProgramError::Custom(108)); // NotClaimable
        }
    };

    msg!("Executing payout transfer of {} base units to user", payout_amount);

    let vault_seeds = &[
        b"vault".as_ref(),
        duel_account.key.as_ref(),
        &[duel.vault_bump],
    ];
    let signer_seeds = &[&vault_seeds[..]];

    let transfer_ix = spl_token::instruction::transfer(
        token_program.key,
        vault_token_account.key,
        user_token_account.key,
        vault_pda.key, // Vault PDA is the authorized authority of the vault token account
        &[],
        payout_amount,
    )?;

    invoke_signed(
        &transfer_ix,
        &[
            vault_token_account.clone(),
            user_token_account.clone(),
            vault_pda.clone(),
            token_program.clone(),
        ],
        signer_seeds,
    )?;

    position.claimed = true;
    position.serialize(&mut *position_account.data.borrow_mut())?;

    msg!("Payout claim successful!");
    Ok(())
}
