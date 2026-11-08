import type { GameValue } from './context.js';
import { game } from './context.js';
import { bankDeposit, bankWithdraw } from './economy.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import { BANK_MIN_DEPOSIT, depositError, maxDeposit, withdrawError } from './bank-rules.js';
import { saveGame } from './saves.js';

const dindini = (n: number) => `${n.toLocaleString('it-IT')} Đ`;

// Sportello della banca: mostra i saldi e permette di depositare o prelevare.
export async function openBankCounter(): Promise<void> {
  const vault: number = game.moneyLevel;
  const bank: number = game.bankBalance || 0;
  const canDeposit = maxDeposit(vault) > 0;
  const res: GameValue = await openDialog({
    title: '🏦 Sportello Bancario',
    text:
      `Buongiorno! Come posso aiutarla?\n\n` +
      `💳 Sul conto: ${dindini(bank)}\n🔐 In cassaforte: ${dindini(vault)}\n\n` +
      `I soldi in banca sono al sicuro dai ladri. Il deposito minimo è di ${dindini(BANK_MIN_DEPOSIT)}.` +
      (canDeposit
        ? ''
        : `\n\n⚠️ Per depositare servono almeno ${dindini(BANK_MIN_DEPOSIT)} in cassaforte.`),
    buttons: [
      { label: 'Esci', value: null, color: '#57606f' },
      ...(bank > 0 ? [{ label: '💸 Preleva', value: 'withdraw', color: '#e67e22' }] : []),
      ...(canDeposit ? [{ label: '💰 Deposita', value: 'deposit', color: '#2ed573' }] : []),
    ],
  });
  if (res.action === 'deposit') await askDeposit();
  else if (res.action === 'withdraw') await askWithdraw();
}

async function askAmount(title: string, text: string, label: string, color: string) {
  const res: GameValue = await openDialog({
    title,
    text,
    input: { placeholder: 'Importo in Đ', numeric: true, maxLength: 9 },
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label, value: 'ok', color },
    ],
  });
  if (res.action !== 'ok') return null;
  return Number(String(res.value || '').trim());
}

async function askDeposit(): Promise<void> {
  const max = maxDeposit(game.moneyLevel);
  const amount = await askAmount(
    '💰 Deposito',
    `Quanto vuoi depositare?\nMinimo ${dindini(BANK_MIN_DEPOSIT)}, massimo ${dindini(max)}.`,
    'Deposita',
    '#2ed573',
  );
  if (amount === null) return;
  const error = depositError(amount, game.moneyLevel);
  if (error) {
    toast('❌ ' + error, 4500);
    return;
  }
  if (!(await bankDeposit(amount))) return;
  sfx('coin');
  saveGame(true);
  toast(`✅ Hai depositato ${dindini(amount)}. Sul conto: ${dindini(game.bankBalance)}`, 4500);
}

async function askWithdraw(): Promise<void> {
  const bank = game.bankBalance || 0;
  const amount = await askAmount(
    '💸 Prelievo',
    `Quanto vuoi prelevare? Sul conto hai ${dindini(bank)}.\nI soldi tornano nella tua cassaforte.`,
    'Preleva',
    '#e67e22',
  );
  if (amount === null) return;
  const error = withdrawError(amount, bank);
  if (error) {
    toast('❌ ' + error, 4500);
    return;
  }
  if (!(await bankWithdraw(amount))) return;
  sfx('coin');
  saveGame(true);
  toast(`✅ Hai prelevato ${dindini(amount)}. In cassaforte: ${dindini(game.moneyLevel)}`, 4500);
}
