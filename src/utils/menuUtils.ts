import * as readline from 'readline';

export type MenuChoice<T> = {
  name: string;
  value: T;
  description?: string;
};

const C = {
  CYAN:  '\x1b[36m',
  GREEN: '\x1b[32m',
  DIM:   '\x1b[2m',
  BOLD:  '\x1b[1m',
  RESET: '\x1b[0m',
};

function renderMenu<T>(
  message: string,
  choices: MenuChoice<T>[],
  selectedIndex: number
): number {
  const lines: string[] = [];
  lines.push(`${C.BOLD}? ${message}${C.RESET}`);

  choices.forEach((c, i) => {
    const sel    = i === selectedIndex;
    const cursor = sel ? `${C.CYAN}❯${C.RESET}` : ' ';
    const name   = sel ? `${C.CYAN}${c.name}${C.RESET}` : c.name;
    lines.push(`  ${cursor} ${C.DIM}${i + 1}.${C.RESET} ${name}`);
  });

  lines.push(
    `${C.DIM}  ↑↓ navegar  ·  1–${choices.length} entrada directa  ·  ⌫ volver${C.RESET}`
  );

  process.stdout.write(lines.join('\n') + '\n');
  return lines.length;
}

/**
 * Menú interactivo con:
 *  - Flechas ↑↓ para navegar
 *  - Teclas numéricas para selección inmediata
 *  - Enter para confirmar
 *  - Backspace para volver (retorna null)
 *  - Ctrl+C para salir
 *
 * Usa readline.emitKeypressEvents en lugar de leer `data` en raw mode,
 * lo que garantiza que `key.name === 'backspace'` funcione correctamente
 * en cualquier terminal y después de cualquier prompt de @inquirer.
 */
export async function menuSelect<T>(
  message: string,
  choices: MenuChoice<T>[]
): Promise<T | null> {

  if (!process.stdin.isTTY) {
    choices.forEach((c, i) => process.stdout.write(`  ${i + 1}. ${c.name}\n`));
    return choices[0].value;
  }

  return new Promise((resolve) => {
    let selectedIndex = 0;
    let lineCount     = renderMenu(message, choices, selectedIndex);

    // readline.emitKeypressEvents parsea correctamente las secuencias de
    // escape y emite eventos 'keypress' con key.name ya resuelto.
    // Es idempotente: llamarlo varias veces no genera listeners duplicados.
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    // ── helpers ──────────────────────────────────────────────────────────────

    const redraw = () => {
      process.stdout.write(`\x1b[${lineCount}A\x1b[J`);
      lineCount = renderMenu(message, choices, selectedIndex);
    };

    const finish = (value: T, index: number) => {
      process.stdout.write(`\x1b[${lineCount}A\x1b[J`);
      process.stdout.write(`${C.BOLD}? ${message}${C.RESET}\n`);
      process.stdout.write(`  ${C.GREEN}❯ ${choices[index].name}${C.RESET}\n`);
      cleanup();
      resolve(value);
    };

    const cancel = () => {
      process.stdout.write(`\x1b[${lineCount}A\x1b[J`);
      cleanup();
      resolve(null);
    };

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };

    // ── handler ──────────────────────────────────────────────────────────────

    // ch  = carácter crudo recibido (undefined para teclas especiales puras)
    // key = objeto parseado con .name, .ctrl, .sequence, etc.
    const onKeypress = (ch: string | undefined, key: readline.Key) => {
      if (!key) return;

      // ── Backspace: chequeamos el byte crudo PRIMERO porque key.name puede
      //    variar entre terminales (\x7f en la mayoría, \x08 en algunos viejos).
      //    También cubrimos Escape como alternativa de "volver".
      if (ch === '\x7f' || ch === '\x08' || key.name === 'backspace' || key.name === 'escape') {
        cancel();
        return;
      }

      // ── Números 1–9: selección directa
      if (ch && /^[1-9]$/.test(ch)) {
        const num = parseInt(ch, 10);
        if (num >= 1 && num <= choices.length) {
          finish(choices[num - 1].value, num - 1);
          return;
        }
      }

      switch (key.name) {
        case 'return':
        case 'enter':
          finish(choices[selectedIndex].value, selectedIndex);
          break;

        case 'up':
          selectedIndex = (selectedIndex - 1 + choices.length) % choices.length;
          redraw();
          break;

        case 'down':
          selectedIndex = (selectedIndex + 1) % choices.length;
          redraw();
          break;

        case 'c':
          if (key.ctrl) { cleanup(); process.exit(0); }
          break;
      }
    };

    process.stdin.on('keypress', onKeypress);
  });
}