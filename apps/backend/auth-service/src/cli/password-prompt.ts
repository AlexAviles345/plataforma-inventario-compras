import type { Readable } from 'node:stream';

export class PromptCancelledError extends Error {
  constructor() {
    super('Operación cancelada');
    this.name = 'PromptCancelledError';
  }
}

interface TtyInput extends Readable {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => unknown;
}

interface Output {
  write(chunk: string): unknown;
}

/**
 * Lee una línea en modo raw sin mostrar lo que se escribe: no hay eco, ni
 * asteriscos que revelen la longitud. Ctrl+C cancela; Backspace borra.
 */
export function readHiddenLine(
  prompt: string,
  input: TtyInput,
  output: Output,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      input.off('data', onData);
      input.setRawMode?.(false);
      input.pause();
      output.write('\n');
    };
    const onData = (chunk: Buffer | string) => {
      const text = chunk.toString();
      // Teclas especiales (flechas, F1...) llegan como secuencias de escape.
      if (text.startsWith('\u001b')) return;
      for (const char of text) {
        if (char === '\r' || char === '\n' || char === '\u0004') {
          cleanup();
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          cleanup();
          reject(new PromptCancelledError());
          return;
        }
        if (char === '\u007f' || char === '\b')
          value = [...value].slice(0, -1).join('');
        else if (char >= ' ') value += char;
      }
    };
    output.write(prompt);
    input.setRawMode?.(true);
    input.on('data', onData);
    input.resume();
  });
}

/**
 * Entrada no interactiva (tubería): toma la primera línea sin el salto final.
 * Permite automatizar el bootstrap sin poner la contraseña en variables de
 * entorno ni en argumentos, que quedan visibles en el historial y en `ps`.
 */
export async function readFirstLine(input: Readable): Promise<string> {
  let buffer = '';
  for await (const chunk of input) {
    buffer += (chunk as Buffer | string).toString();
    const newline = buffer.indexOf('\n');
    if (newline !== -1) {
      input.destroy();
      return buffer.slice(0, newline).replace(/\r$/, '');
    }
  }
  return buffer.replace(/\r$/, '');
}

/** En terminal pide la contraseña dos veces; por tubería la lee una vez. */
export async function readNewPassword(streams: {
  input: TtyInput;
  output: Output;
  notice: (line: string) => void;
}): Promise<string> {
  const { input, output, notice } = streams;
  if (!input.isTTY) {
    notice('Leyendo la contraseña desde la entrada estándar (no interactivo).');
    return readFirstLine(input);
  }
  const password = await readHiddenLine('Contraseña: ', input, output);
  const confirmation = await readHiddenLine(
    'Confirmar contraseña: ',
    input,
    output,
  );
  if (password !== confirmation)
    throw new Error('Las contraseñas no coinciden');
  return password;
}
