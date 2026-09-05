import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const browser = await chromium.connectOverCDP('http://127.0.0.1:5858');
try {
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  await page.goto('http://localhost:8888/vi/subtitleMerge/');
  await page.getByRole('button', { name: 'Thêm voice' }).click();
  await page
    .getByPlaceholder('Nhập nội dung cần tạo giọng...')
    .fill('Xin chào, đây là kiểm tra trực quan OmniVoice trong ứng dụng.');
  await page.getByRole('button', { name: 'Tạo và thêm vào timeline' }).click();
  await expect(page.getByLabel('OmniVoice waveform')).toBeVisible({ timeout: 150_000 });
  await expect(page.locator('audio[controls]')).toBeVisible();
  fs.mkdirSync(path.resolve('test-artifacts'), { recursive: true });
  await page.screenshot({ path: path.resolve('test-artifacts/omnivoice-live-ui.png'), fullPage: true });
  await page.getByRole('button', { name: 'Thêm bản nghe thử vào timeline' }).click();
  await expect(page.getByText(/Đã thêm voice vào audio track/)).toBeVisible();
  console.log('OmniVoice live Electron UI test passed');
} finally {
  await browser.close();
}
