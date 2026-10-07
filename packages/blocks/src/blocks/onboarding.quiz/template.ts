import { canonicalJson } from '../../canonical.js';
import type { RenderContext, RenderedBlock } from '../../types.js';

const HEADER = `import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export interface QuizQuestion {
  prompt: string;
  options: string[];
  multi?: boolean;
}

export interface QuizConfig {
  questions: QuizQuestion[];
  skippable: boolean;
}

export interface QuizResult {
  answers: Record<string, string[]>;
  skipped: boolean;
}
`;

function stylesBlock(extra: string): string {
  return `
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  error: {
    color: theme.colors.text,
    fontSize: 16,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.primary,
  },
  counter: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 8,
  },
  prompt: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 20,
  },
  option: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  optionSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: '#F5F3FF',
  },
  optionPressed: {
    opacity: 0.7,
  },
  optionText: {
    fontSize: 16,
    color: theme.colors.text,
  },
  optionTextSelected: {
    fontWeight: '600',
    color: theme.colors.primary,
  },
  primaryButton: {
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  skipText: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 14,
    color: '#6B7280',
    textDecorationLine: 'underline',
  },
${extra}});
`;
}

function renderCards(ctx: RenderContext, configJson: string): string {
  const name = ctx.componentName;
  return `${HEADER}
const CONFIG: QuizConfig = ${configJson};

interface ${name}Props {
  onComplete?: (result: QuizResult) => void;
}

export function ${name}({ onComplete }: ${name}Props) {
  const total = CONFIG.questions.length;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});

  const question = CONFIG.questions[index];
  if (!question) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>No questions configured.</Text>
      </View>
    );
  }

  const key = String(index);
  const selected = answers[key] ?? [];
  const progress = ((index + 1) / total) * 100;
  const isLast = index + 1 >= total;
  const canContinue = selected.length > 0;

  function toggle(option: string, multi: boolean) {
    setAnswers((prev) => {
      const current = prev[key] ?? [];
      const next = multi
        ? current.includes(option)
          ? current.filter((o) => o !== option)
          : [...current, option]
        : [option];
      return { ...prev, [key]: next };
    });
  }

  function goNext() {
    if (isLast) {
      onComplete?.({ answers, skipped: false });
    } else {
      setIndex(index + 1);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: \`\${progress}%\` }]} />
      </View>
      <Text style={styles.counter}>
        Question {index + 1} of {total}
      </Text>
      <Text style={styles.prompt}>{question.prompt}</Text>
      {question.options.map((option) => {
        const isSelected = selected.includes(option);
        return (
          <Pressable
            key={option}
            onPress={() => toggle(option, question.multi ?? false)}
            style={({ pressed }) => [
              styles.option,
              isSelected && styles.optionSelected,
              pressed && styles.optionPressed,
            ]}
          >
            <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
              {option}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        onPress={goNext}
        disabled={!canContinue}
        style={({ pressed }) => [
          styles.primaryButton,
          !canContinue && styles.buttonDisabled,
          pressed && canContinue && styles.buttonPressed,
        ]}
      >
        <Text style={styles.primaryButtonText}>{isLast ? 'Finish' : 'Next'}</Text>
      </Pressable>
      {CONFIG.skippable ? (
        <Pressable onPress={() => onComplete?.({ answers, skipped: true })}>
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
${stylesBlock('')}`;
}

function renderList(ctx: RenderContext, configJson: string): string {
  const name = ctx.componentName;
  return `${HEADER}
const CONFIG: QuizConfig = ${configJson};

interface ${name}Props {
  onComplete?: (result: QuizResult) => void;
}

export function ${name}({ onComplete }: ${name}Props) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});

  const total = CONFIG.questions.length;
  const answeredCount = CONFIG.questions.filter((q, i) => (answers[String(i)] ?? []).length > 0).length;
  const canSubmit = answeredCount >= total;

  function toggle(qIndex: number, option: string, multi: boolean) {
    const key = String(qIndex);
    setAnswers((prev) => {
      const current = prev[key] ?? [];
      const next = multi
        ? current.includes(option)
          ? current.filter((o) => o !== option)
          : [...current, option]
        : [option];
      return { ...prev, [key]: next };
    });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.listContent}>
      {CONFIG.questions.map((question, qIndex) => {
        const selected = answers[String(qIndex)] ?? [];
        return (
          <View key={qIndex} style={styles.questionBlock}>
            <Text style={styles.prompt}>{question.prompt}</Text>
            {question.options.map((option) => {
              const isSelected = selected.includes(option);
              return (
                <Pressable
                  key={option}
                  onPress={() => toggle(qIndex, option, question.multi ?? false)}
                  style={({ pressed }) => [
                    styles.option,
                    isSelected && styles.optionSelected,
                    pressed && styles.optionPressed,
                  ]}
                >
                  <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        );
      })}
      <Pressable
        onPress={() => onComplete?.({ answers, skipped: false })}
        disabled={!canSubmit}
        style={({ pressed }) => [
          styles.primaryButton,
          !canSubmit && styles.buttonDisabled,
          pressed && canSubmit && styles.buttonPressed,
        ]}
      >
        <Text style={styles.primaryButtonText}>Submit</Text>
      </Pressable>
      {CONFIG.skippable ? (
        <Pressable onPress={() => onComplete?.({ answers, skipped: true })}>
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
${stylesBlock(`  listContent: {
    paddingBottom: 32,
  },
  questionBlock: {
    marginBottom: 24,
  },
`)}`;
}

export function render(ctx: RenderContext): RenderedBlock {
  const configJson = canonicalJson(ctx.config);
  const variant = ctx.variant === 'quiz-list' ? 'quiz-list' : 'quiz-cards';
  return {
    fileName: `${ctx.instanceId}.tsx`,
    content: variant === 'quiz-list' ? renderList(ctx, configJson) : renderCards(ctx, configJson),
    acceptsOnComplete: true,
    acceptsInput: false,
  };
}
