const DEFAULT_WELCOME_BACK_TEXT = 'Welcome back, [name]! 👋';

export function formatCatWelcomeBack(configuredText, name) {
  const template = typeof configuredText === 'string' && configuredText.trim()
    ? configuredText.trim()
    : DEFAULT_WELCOME_BACK_TEXT;
  if (!/\[name\]/i.test(template)) return template;

  // A profile field can contain an email address. Never render it in the bubble.
  const safeName = typeof name === 'string' ? name.trim().split('@')[0].trim() : '';
  if (safeName) return template.replace(/\[name\]/gi, safeName);

  return template
    .replace(/,\s*\[name\]/gi, '')
    .replace(/\[name\],\s*/gi, '')
    .replace(/\[name\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
