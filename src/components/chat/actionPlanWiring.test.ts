import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

describe('action plan wiring', () => {
  it('is available on desktop and mobile for an existing conversation', () => {
    expect(source).toContain('data-testid="chat-action-plan-toggle"');
    expect(source).toContain('data-testid="chat-action-plan-menuitem"');
    expect(source).toContain('<ActionPlanPanel');
  });

  it('belongs to the selected conversation, including fresh-start mode', () => {
    expect(source).toContain('assistantId={selectedAssistant.id}');
    expect(source).toContain('freshTs={freshTs}');
  });

  it('returns plan discussion to the regular send queue', () => {
    const start = source.indexOf('const handleDiscussActionPlan');
    const end = source.indexOf('// Досылка очереди', start);
    expect(start).toBeGreaterThan(-1);
    expect(source.slice(start, end)).toContain('void submitText(');
  });
});
