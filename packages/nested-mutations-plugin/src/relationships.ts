import type {PgCodecRelation, PgCodecWithAttributes} from '@dataplan/pg';
import type {PgTableResource} from './helpers.ts';

export interface PgResourceRelationInput
  extends Omit<PgCodecRelation<PgCodecWithAttributes, PgTableResource>, 'localCodec'> {
  name: string;
  localResource: PgTableResource;
}
