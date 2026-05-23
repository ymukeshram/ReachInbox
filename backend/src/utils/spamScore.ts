export interface SpamResult {
  score: number;          // 0-100
  issues: string[];
  rating: 'safe' | 'caution' | 'risky';
}

const SPAM_PHRASES = [
  'click here', 'act now', 'limited time', 'offer expires', 'buy now',
  'order now', 'special promotion', 'guaranteed', 'risk-free', 'no cost',
  '100% free', 'earn money', 'make money', 'extra income', 'work from home',
  'million dollars', 'you have been selected', 'congratulations',
  'claim your prize', 'you won', 'free gift', 'free offer',
  'no obligation', 'once in a lifetime', 'winner', 'jackpot',
  'dear friend', 'this is not spam',
];

export function calculateSpamScore(subject: string, body: string): SpamResult {
  const issues: string[] = [];
  let score = 0;

  const combined  = `${subject} ${body}`.toLowerCase();
  const plainBody = body.replace(/<[^>]*>/g, '');

  // Spam phrase check
  for (const phrase of SPAM_PHRASES) {
    if (combined.includes(phrase)) {
      score += 8;
      issues.push(`Spam trigger phrase: "${phrase}"`);
      if (issues.length >= 5) break; // cap issue list
    }
  }

  // ALL-CAPS words in subject
  const subjectWords  = subject.split(/\s+/);
  const capsCount     = subjectWords.filter(w => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w)).length;
  if (capsCount >= 3) {
    score += 15;
    issues.push('Too many ALL-CAPS words in subject');
  } else if (capsCount >= 1) {
    score += 5;
    issues.push('ALL-CAPS word(s) in subject');
  }

  // Excessive exclamation marks
  const exclamations = (combined.match(/!/g) || []).length;
  if (exclamations > 5) { score += 15; issues.push('Excessive exclamation marks (>5)'); }
  else if (exclamations > 2) { score += 5; issues.push('Multiple exclamation marks'); }

  // Excessive links
  const links = (plainBody.match(/https?:\/\//g) || []).length;
  if (links > 5) { score += 15; issues.push('Too many links (>5)'); }
  else if (links > 3) { score += 5; issues.push('Several links in email (>3)'); }

  // Subject length
  if (subject.length < 5)  { score += 20; issues.push('Subject too short'); }
  if (subject.length > 80) { score += 5;  issues.push('Subject too long (>80 chars)'); }

  // Currency overuse
  const currencies = (combined.match(/[$£€₹]/g) || []).length;
  if (currencies > 3) { score += 10; issues.push('Overuse of currency symbols'); }

  // No personalisation (generic mass email signal)
  if (!combined.includes('{{') && plainBody.length > 200) {
    score += 3;
    issues.push('No personalisation variables used');
  }

  // Missing unsubscribe hint (already auto-injected by emailService, just warn)
  if (!combined.includes('unsubscribe') && !combined.includes('opt out')) {
    score += 5;
    issues.push('No unsubscribe mention (auto-added by Reachify)');
  }

  const capped  = Math.min(100, score);
  const rating  = capped < 25 ? 'safe' : capped < 55 ? 'caution' : 'risky';

  return { score: capped, issues, rating };
}
