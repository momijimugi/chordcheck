import { RiskLevel } from '../types/analysis';
import { FilterType } from '../types/state';

/**
 * Shared filter predicate for matching note risk level with selected FilterType.
 * Specifically ensures that 'CHECK' filter includes both 'CHECK' and 'WARNING'.
 */
export function matchesNoteFilter(status: RiskLevel, filter: FilterType): boolean {
  switch (filter) {
    case 'WARNING_ONLY':
      return status === 'WARNING';
    case 'CHECK':
      return status === 'CHECK' || status === 'WARNING';
    case 'INFO':
      return status === 'INFO';
    case 'SAFE':
      return status === 'SAFE';
    case 'ALL':
    default:
      return true;
  }
}
