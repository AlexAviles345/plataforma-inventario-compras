import { PassThrough, Readable } from 'node:stream';
import {
  PromptCancelledError,
  readFirstLine,
  readHiddenLine,
  readNewPassword,
} from './password-prompt';

/** Terminal simulada: registra el modo raw y todo lo que se muestra. */
function fakeTerminal() {
  const rawModes: boolean[] = [];
  const input = Object.assign(new PassThrough(), {
    isTTY: true,
    rawModes,
    setRawMode: (mode: boolean) => rawModes.push(mode),
  });
  const shown: string[] = [];
  const output = { write: (chunk: string) => shown.push(chunk) };
  return { input, output, shown };
}

describe('readHiddenLine', () => {
  it('reads without echo, supports backspace and restores the terminal', async () => {
    const { input, output, shown } = fakeTerminal();
    const line = readHiddenLine('Contraseña: ', input, output);
    input.write('secre');
    input.write('x\u007f');
    input.write('to-ñ\r');

    await expect(line).resolves.toBe('secreto-ñ');
    expect(shown.join('')).toBe('Contraseña: \n');
    expect(input.rawModes).toEqual([true, false]);
  });

  it('ignores escape sequences such as arrow keys', async () => {
    const { input, output } = fakeTerminal();
    const line = readHiddenLine('> ', input, output);
    input.write('ab');
    input.write('\u001b[A');
    input.write('c\n');
    await expect(line).resolves.toBe('abc');
  });

  it('cancels on Ctrl+C', async () => {
    const { input, output } = fakeTerminal();
    const line = readHiddenLine('> ', input, output);
    input.write('abc\u0003');
    await expect(line).rejects.toBeInstanceOf(PromptCancelledError);
    expect(input.rawModes).toEqual([true, false]);
  });
});

describe('readFirstLine', () => {
  it.each([
    [['clave-larga-1\r\nresto'], 'clave-larga-1'],
    [['clave', '-larga', '\n'], 'clave-larga'],
    [['sin salto final'], 'sin salto final'],
    [['  con espacios  \n'], '  con espacios  '],
    [['﻿clave-de-powershell\r\n'], 'clave-de-powershell'],
  ])('reads the first line of %j', async (chunks, expected) => {
    await expect(readFirstLine(Readable.from(chunks))).resolves.toBe(expected);
  });
});

describe('readNewPassword', () => {
  it('asks twice on a terminal and returns the confirmed password', async () => {
    const { input, output, shown } = fakeTerminal();
    const password = readNewPassword({ input, output, notice: jest.fn() });
    input.write('Clave-Segura-1\r');
    await new Promise((resolve) => setImmediate(resolve));
    input.write('Clave-Segura-1\r');

    await expect(password).resolves.toBe('Clave-Segura-1');
    expect(shown.filter((text) => text.includes('ontraseña'))).toEqual([
      'Contraseña: ',
      'Confirmar contraseña: ',
    ]);
  });

  it('fails when the confirmation differs', async () => {
    const { input, output } = fakeTerminal();
    const password = readNewPassword({ input, output, notice: jest.fn() });
    input.write('Clave-Segura-1\r');
    await new Promise((resolve) => setImmediate(resolve));
    input.write('Clave-Segura-2\r');
    await expect(password).rejects.toThrow('no coinciden');
  });

  it('reads a single line from a pipe and says so', async () => {
    const notice = jest.fn();
    await expect(
      readNewPassword({
        input: Readable.from(['Clave-Segura-1\n']),
        output: { write: jest.fn() },
        notice,
      }),
    ).resolves.toBe('Clave-Segura-1');
    expect(notice).toHaveBeenCalledWith(
      expect.stringContaining('no interactivo'),
    );
  });
});
