import { EventLog, EventPolicy, PolicyAction } from '../../config/types';
import { logger } from '../../utils/logger';

interface Condition {
  var?: string;
  '=='?: [unknown, unknown];
  '>='?: [unknown, unknown];
  '<='?: [unknown, unknown];
  and?: Condition[];
  or?: Condition[];
}

export class PolicyEngine {
  matchPolicies(event: EventLog, policies: EventPolicy[]): PolicyAction[] {
    const matchedPolicies = policies.filter(policy => this.evaluatePolicy(event, policy));

    const sortedPolicies = matchedPolicies.sort(
      (a, b) => (b.priority || 0) - (a.priority || 0)
    );

    const actions: PolicyAction[] = [];
    for (const policy of sortedPolicies) {
      actions.push(...policy.actions);
    }

    logger.info('Policy matching completed', {
      event_type: event.event_type,
      matched_policies: matchedPolicies.length,
      actions: actions.length,
    });

    return actions;
  }

  private evaluatePolicy(event: EventLog, policy: EventPolicy): boolean {
    if (!this.matchEventType(event.event_type, policy.event_type)) {
      return false;
    }

    if (!policy.condition) {
      return true;
    }

    return this.evaluateCondition(policy.condition, event);
  }

  private matchEventType(eventType: string, policyPattern: string): boolean {
    if (policyPattern === '*') {
      return true;
    }

    if (policyPattern.endsWith('*')) {
      const prefix = policyPattern.slice(0, -1);
      return eventType.startsWith(prefix);
    }

    return eventType === policyPattern;
  }

  private evaluateCondition(condition: Condition, event: EventLog): boolean {
    if ('var' in condition) {
      return this.resolveVariable(condition.var as string, event) as boolean;
    }

    if ('==' in condition) {
      const cond = condition['=='] as [unknown, unknown];
      const [left, right] = cond;
      return this.resolveValue(left, event) === this.resolveValue(right, event);
    }

    if ('>=' in condition) {
      const cond = condition['>='] as [unknown, unknown];
      const [left, right] = cond;
      const leftVal = this.resolveValue(left, event) as number;
      const rightVal = this.resolveValue(right, event) as number;
      return leftVal >= rightVal;
    }

    if ('<=' in condition) {
      const cond = condition['<='] as [unknown, unknown];
      const [left, right] = cond;
      const leftVal = this.resolveValue(left, event) as number;
      const rightVal = this.resolveValue(right, event) as number;
      return leftVal <= rightVal;
    }

    if ('and' in condition) {
      return condition.and!.every(c => this.evaluateCondition(c, event));
    }

    if ('or' in condition) {
      return condition.or!.some(c => this.evaluateCondition(c, event));
    }

    return false;
  }

  private resolveValue(value: unknown, event: EventLog): unknown {
    if (typeof value === 'object' && value !== null && 'var' in value) {
      return this.resolveVariable((value as { var: string }).var, event);
    }
    return value;
  }

  private resolveVariable(path: string, event: EventLog): unknown {
    const parts = path.split('.');
    let current: unknown = event;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }
}
