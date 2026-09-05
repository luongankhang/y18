import { _electron as electron, test, expect } from '@playwright/test';
import path from 'node:path';
import electronPath from 'electron';

test.describe('OmniVoice timeline UI', () => {
  test('generates a real voice, shows preview waveform, then inserts it', async () => {
    test.setTimeout(180_000);
    const app = await electron.launch({
      // Launch through package.json so app.getAppPath() remains the project
      // root. Launching app/background.js directly makes electron-serve look
      // for the renderer under app/app and opens chrome-error:// instead.
      args: ['--no-sandbox', path.resolve('.')],
      executablePath: electronPath,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        Y18_E2E: '1',
        Y18_OMNIVOICE_PYTHON: path.resolve(
          '.venv-omnivoice/Scripts/python.exe',
        ),
      },
    });
    try {
      const page = await app.firstWindow();
      page.on('console', (message) =>
        console.log(`[renderer:${message.type()}] ${message.text()}`),
      );
      page.on('pageerror', (error) =>
        console.error(`[renderer:error] ${error.message}`),
      );
      await page.waitForLoadState('domcontentloaded');
      console.log('Electron E2E page:', page.url(), await page.title());
      await expect(
        page.getByRole('button', { name: 'Thêm voice' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Thêm voice' }).click();
      await page
        .getByPlaceholder('Nhập nội dung cần tạo giọng...')
        .fill('Đây là bài kiểm tra OmniVoice.');
      await page
        .getByRole('button', { name: 'Tạo và thêm vào timeline' })
        .click();
      const status = page.getByTestId('omnivoice-status');
      await expect(status).toBeVisible();
      await expect
        .poll(async () => (await status.textContent()) || '', {
          timeout: 150_000,
          message: 'OmniVoice must finish or expose its real error',
        })
        .not.toMatch(/^Đang/);
      console.log('OmniVoice E2E status:', await status.textContent());
      await expect(page.getByLabel('OmniVoice waveform')).toBeVisible();
      await expect(page.locator('audio[controls]')).toBeVisible();
      await page
        .getByRole('button', { name: 'Thêm bản nghe thử vào timeline' })
        .click();
      await expect(
        page.getByText(/Đã thêm voice vào audio track/),
      ).toBeVisible();
    } finally {
      const appProcess = app.process();
      await Promise.race([
        app.close(),
        new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
      ]);
      if (!appProcess.killed) appProcess.kill();
    }
  });
});
