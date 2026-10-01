const { Connection, PublicKey } = require('@solana/web3.js');

const MAINNET_RPC = process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com';
const SKR_PROGRAM_ID = new PublicKey('SKRskrmtL83pcL4YqLWt6iPefDqwXQWHSw9S9vz94BZ');

// Official Mainnet StakeConfig and GuardianPool PDAs
const STAKE_CONFIG_PDA = new PublicKey('4HQy82s9CHTv1GsYKnANHMiHfhcqesYkK6sB3RDSYyqw');
const GUARDIAN_POOL_PDA = new PublicKey('DPJ58trLsF9yPrBa2pk6UaRkvqW8hWUYjawe788WBuqr');

// Seeker Arena access rule (single definition): ANY active Mainnet stake
// (> 0 SKR) verified against the official staking program. SKR grants access
// and reputation only: never odds, winners, or custody.
function isStakeEligible(stakedAmountSkr) {
  return Number(stakedAmountSkr) > 0;
}

function deriveUserStakePda(userWalletPubkey) {
  const [userStakePda, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('user_stake'),
      STAKE_CONFIG_PDA.toBuffer(),
      userWalletPubkey.toBuffer(),
      GUARDIAN_POOL_PDA.toBuffer(),
    ],
    SKR_PROGRAM_ID
  );
  return { userStakePda, bump };
}

async function querySkrStakedAmount(walletAddressString) {
  try {
    const userWallet = new PublicKey(walletAddressString);
    const { userStakePda } = deriveUserStakePda(userWallet);
    const connection = new Connection(MAINNET_RPC, 'confirmed');

    const accountInfo = await connection.getAccountInfo(userStakePda);
    if (!accountInfo || !accountInfo.data || accountInfo.data.length === 0) {
      return {
        wallet: walletAddressString,
        userStakePda: userStakePda.toBase58(),
        stakedAmountSkr: 0,
        isEligible: false,
        rawShares: 0,
      };
    }

    // Decode UserStake account structure
    // Offset 0-7: 8-byte discriminator
    // Offset 8-39: user wallet pubkey
    // Offset 40-71: stake config pubkey
    // Offset 72-103: guardian pool pubkey
    // Offset 104-111: u64 shares
    const data = accountInfo.data;
    let shares = 0n;
    if (data.length >= 112) {
      shares = data.readBigUInt64LE(104);
    }

    const stakedAmountSkr = Number(shares) / 1e6; // SKR 6 decimals
    const isEligible = isStakeEligible(stakedAmountSkr);

    return {
      wallet: walletAddressString,
      userStakePda: userStakePda.toBase58(),
      stakedAmountSkr,
      isEligible,
      rawShares: shares.toString(),
    };
  } catch (err) {
    console.error(`Error querying SKR stake for ${walletAddressString}:`, err.message);
    return {
      wallet: walletAddressString,
      stakedAmountSkr: 0,
      isEligible: false,
      error: err.message,
    };
  }
}

module.exports = {
  deriveUserStakePda,
  querySkrStakedAmount,
  isStakeEligible,
};
