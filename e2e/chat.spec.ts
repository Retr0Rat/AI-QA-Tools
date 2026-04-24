import { test, expect } from '@playwright/test';

test('submitting a course question returns a non-empty assistant response', async ({ page }) => {
  await page.goto('/');

  const input = page.getByPlaceholder('Ask about a course, tool, or topic...');
  const sendButton = page.getByRole('button', { name: 'Send' });

  await input.fill('What tools does AIDI-2000 use?');
  await sendButton.click();

  // Wait for the streaming response to settle — the assistant bubble starts
  // empty and fills in. We wait until its text is non-empty.
  const assistantMessage = page.locator('.bg-white.border.border-gray-200.text-gray-800').last();
  await expect(assistantMessage).not.toBeEmpty({ timeout: 30_000 });
  await expect(assistantMessage).toContainText(/\w+/);

  // Response must not begin with an error indicator
  const text = await assistantMessage.textContent();
  expect(text?.trimStart()).not.toMatch(/^(Error|error|Failed|failed|Sorry, something went wrong)/);
});
