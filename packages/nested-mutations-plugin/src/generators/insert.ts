import type {GetPgResourceAttributes} from '@dataplan/pg';
import type {PgCodecRelationWithName} from '../helpers.ts';

export function relationshipInsertSingle<TRelationship extends PgCodecRelationWithName>(
  build: GraphileBuild.Build,
  relationship: TRelationship,
  input: Record<keyof GetPgResourceAttributes<TRelationship['remoteResource']>, unknown>
) {}
