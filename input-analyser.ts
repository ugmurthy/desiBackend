

interface TaskComplexity {
  isComplex: boolean;
  estimatedSubTasks: number;
  requiresDecomposition: boolean;
  confidence: number;
}

export class InputAnalyzer {
  async analyzeComplexity(prompt: string): Promise<TaskComplexity> {
    // Use lightweight model or heuristics
    const indicators = {
      multipleQuestions: (prompt.match(/\?/g) || []).length > 1,
      hasSequentialWords: /then|after|next|following|subsequently/i.test(prompt),
      hasMultipleActions: /and|also|additionally|furthermore/i.test(prompt),
      wordCount: prompt.split(' ').length > 50,
    };
    
    const complexityScore = Object.values(indicators).filter(Boolean).length;
    
    return {
      isComplex: complexityScore >= 2,
      estimatedSubTasks: Math.min(complexityScore * 2, 10),
      requiresDecomposition: complexityScore >= 2,
      confidence: complexityScore / 4,
    };
  }
}



