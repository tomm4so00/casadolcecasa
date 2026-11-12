import { devMode } from './dev-mode.js';
import { startGame } from './interface.js';
import { lifetime } from './runtime.js';
import { setDevelopmentRaid } from './dealer-rules.js';
import { DEV_PIN } from './dev-fixture.js';
import { saveGame } from './saves.js';
import { game } from './context.js';
import { mgStop } from './jobs.js';
import { chooseOrGoToJob } from './world.js';

/** Base comune; ogni scenario aggiunge soltanto stato e comandi propri. */
export async function startDevGame(): Promise<void> {
  if (!devMode) return;
  setDevelopmentRaid(null);
  await startGame();
  const scenario =
    new URLSearchParams(location.search).get('test') === 'police' ? 'police' : 'generic';
  const reset = (): void => location.reload();
  const openScenario = (name: 'generic' | 'police'): void => {
    const url = new URL(location.href);
    url.searchParams.set('test', name === 'generic' ? '1' : name);
    location.assign(url);
  };
  const tools = { scenario: openScenario, reset };
  const buttons: [string, () => unknown][] = [];
  if (scenario === 'police') {
    const specific = await import('./dev-police.js');
    await specific.police();
    Object.assign(tools, specific);
    buttons.push(
      ['Riavvia prova', () => openScenario('police')],
      ['Senza droga', () => specific.police('passeggiata', false)],
      ['Salta attesa 15 min', specific.smoke],
      ['Test generico', () => openScenario('generic')],
    );
  } else {
    buttons.push(['Scenario poliziotto', () => openScenario('police')]);
  }
  buttons.push(['Ricomincia', reset]);
  await saveGame(true);
  Object.assign(window, { testGame: tools });
  const panel = document.createElement('div');
  panel.id = 'dev-test-tools';
  panel.dataset.scenario = scenario;
  panel.style.cssText =
    'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:10000;display:flex;flex-wrap:wrap;gap:6px;padding:8px;background:#202738;color:white;border-radius:8px;font:13px sans-serif;max-width:95vw';
  panel.append(
    `Test ${scenario === 'police' ? 'poliziotto' : 'generico'} · offline · PIN ${DEV_PIN}`,
  );
  for (const [label, action] of buttons) {
    const button = document.createElement('button');
    button.textContent = label;
    button.onclick = () => {
      void action();
    };
    panel.append(button);
  }
  document.body.append(panel);
  const workChoices = document.createElement('div');
  workChoices.id = 'dev-work-choices';
  workChoices.hidden = true;
  workChoices.style.cssText = 'flex-basis:100%;display:none;gap:6px;flex-wrap:wrap';
  const workButton = document.createElement('button');
  workButton.textContent = 'Scenario lavori';
  workButton.setAttribute('aria-expanded', 'false');
  workButton.onclick = () => {
    workChoices.hidden = !workChoices.hidden;
    workChoices.style.display = workChoices.hidden ? 'none' : 'flex';
    workButton.setAttribute('aria-expanded', String(!workChoices.hidden));
  };
  for (const [key, title] of Object.entries({
    cantiere: 'Cantiere',
    ospedale: 'Ospedale',
    ristorante: 'Ristorante',
    ufficio: 'Ufficio',
  })) {
    const button = document.createElement('button');
    button.textContent = title;
    button.onclick = async () => {
      if (!devMode) return;
      mgStop();
      game.activeShift = null;
      game.player.activeJobKey = null;
      game.player.workDay = undefined;
      game.player.healthLevel = game.player.sleepLevel = game.player.hungerLevel = 100;
      await chooseOrGoToJob(key, title);
      workChoices.hidden = true;
      workChoices.style.display = 'none';
      workButton.setAttribute('aria-expanded', 'false');
      // Lascia libera la parte alta per compito e tempo del lavoro.
      panel.style.top = 'auto';
      panel.style.bottom = '8px';
      panel.style.left = '8px';
      panel.style.transform = 'none';
      panel.style.maxWidth = 'min(240px, 45vw)';
    };
    workChoices.append(button);
  }
  panel.append(workButton, workChoices);
  lifetime.add(() => {
    panel.remove();
    Reflect.deleteProperty(window, 'testGame');
    setDevelopmentRaid(undefined);
  });
}
