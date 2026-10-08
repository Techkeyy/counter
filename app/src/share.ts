import { Share } from 'react-native';
import { Duel, Receipt, Take } from './types';
import { PRODUCTION_WEB_URL } from './api';
import { formatUserHandle, formatWalletShort } from './utils/identity';

export type CounterEntityType = 'TAKE' | 'DUEL' | 'RECEIPT';

export type ShareCounterEntityInput = {
  type: CounterEntityType;
  id: string;
  take?: Partial<Take>;
  duel?: Partial<Duel>;
  receipt?: Partial<Receipt>;
};

const cleanId = (value: string) => encodeURIComponent(String(value || '').trim());

export function counterEntityUrl({ type, id, duel }: ShareCounterEntityInput): string {
  if (type === 'TAKE') return `${PRODUCTION_WEB_URL}/t/${cleanId(id)}`;
  if (type === 'RECEIPT') return `${PRODUCTION_WEB_URL}/r/${cleanId(id)}`;
  return `${PRODUCTION_WEB_URL}/d/${cleanId(duel?.share_slug || id)}`;
}

export function counterEntityDeepLink({ type, id, duel }: ShareCounterEntityInput): string {
  if (type === 'TAKE') return `counter://take/${cleanId(id)}`;
  if (type === 'RECEIPT') return `counter://receipt/${cleanId(id)}`;
  return `counter://duel/${cleanId(duel?.share_slug || id)}`;
}

function participant(value: { display_name?: string | null; handle?: string | null; wallet?: string | null } | undefined): string {
  const displayName = value?.display_name?.trim();
  const handle = formatUserHandle(value);
  return displayName || handle || formatWalletShort(value?.wallet) || 'Counter participant';
}

function shareMessage(input: ShareCounterEntityInput, url: string): string {
  if (input.type === 'TAKE') {
    const take = input.take || {};
    const author = take.author_name?.trim()
      || formatUserHandle({ handle: take.author_handle, wallet: take.author_wallet })
      || formatWalletShort(take.author_wallet)
      || 'a Counter user';
    const text = String(take.content || take.topic || 'This Take').trim();
    return `"${text}" — ${author} on Counter.\nThink they're wrong? Challenge this Take:\n${url}`;
  }

  if (input.type === 'DUEL') {
    const duel = input.duel || {};
    const captainA = participant({ display_name: duel.captain_a_name, handle: duel.captain_a_handle, wallet: duel.captain_a_wallet });
    const captainB = participant({ display_name: duel.captain_b_name, handle: duel.captain_b_handle, wallet: duel.captain_b_wallet });
    const context = String((duel as any).topic || duel.proposition_a || duel.proposition_b || 'A Counter Duel').trim();
    return `${captainA} vs ${captainB} on Counter.\n${context}\nView Duel:\n${url}`;
  }

  const receipt = input.receipt || {};
  const captainA = participant({ display_name: receipt.captain_a_name, handle: receipt.captain_a_handle, wallet: receipt.captain_a_wallet });
  const captainB = participant({ display_name: receipt.captain_b_name, handle: receipt.captain_b_handle, wallet: receipt.captain_b_wallet });
  const result = String(receipt.resolution_summary || 'Permanent result recorded').trim();
  return `Counter Receipt\n${captainA} vs ${captainB}\n${result}\n${url}`;
}

/** The only native share entry point for public Counter entities. */
export async function shareCounterEntity(input: ShareCounterEntityInput): Promise<void> {
  const url = counterEntityUrl(input);
  await Share.share({ message: shareMessage(input, url), url });
}

