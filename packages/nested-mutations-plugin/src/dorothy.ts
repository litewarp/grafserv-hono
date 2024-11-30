import type {
  GetPgResourceAttributes,
  PgInsertSingleStep,
  PgUpdateSingleStep,
} from '@dataplan/pg';
import {
  ExecutableStep,
  type ExecutionDetails,
  type GrafastResultsList,
} from 'postgraphile/grafast';
import {type SQL, type SQLRawValue, type SQLable, sql} from 'postgraphile/pg-sql2';
import {type PgTableResource, isPgTableResource} from './helpers.ts';
import {inspect} from './inspect.ts';

type QueryValueDetailsBySymbol = Map<
  symbol,
  {depId: number; processor: (val: unknown) => SQLRawValue}
>;

interface PgInsertSingleWithRelationsStepFinalizeResults {
  text: string;
  /** The values to feed into the query */
  rawSqlValues: ReadonlyArray<SQLRawValue>;

  /** When we see the given symbol in the SQL values, what dependency do we replace it with? */
  queryValueDetailsBySymbol: QueryValueDetailsBySymbol;
}

export class PgInsertSingleWithRelationsStep<
    TResource extends PgTableResource = PgTableResource,
  >
  extends ExecutableStep<unknown[]>
  implements SQLable
{
  static $$export = {
    moduleName: '@litewarp/pg-relation-mutations-plugin',
    exportName: 'PgInsertSingleWithRelationsStep',
  };

  isSyncAndSafe = false;

  public readonly resource: TResource;

  private readonly name: string;

  private readonly symbol: symbol | string;

  //  sql.identifier(this.symbol)
  public readonly alias: SQL;

  private attributes: Array<{
    name: keyof GetPgResourceAttributes<TResource>;
    depId: number;
  }>;

  private contextId: number;

  private locked = false;

  private finalizeResults: PgInsertSingleWithRelationsStepFinalizeResults | null = null;

  constructor($parent: PgInsertSingleStep | PgUpdateSingleStep) {
    super();
    this.hasSideEffects = true;

    if (!isPgTableResource($parent.resource)) {
      throw new Error('Parent resource must be a table with unique constraints');
    }

    this.resource = $parent.resource as TResource;
    this.name = this.resource.name;
    this.symbol = Symbol(this.name);
    this.alias = sql.identifier(this.symbol);
    this.contextId = this.addDependency($parent);
  }

  public toStringMeta(): string | null {
    return `${this.resource.name}WithRelations${this.attributes.map((a) => a.name)}`;
  }

  async execute({indexMap}: ExecutionDetails): Promise<GrafastResultsList<any>> {
    if (!this.finalizeResults) {
      throw new Error('Cannot execute PgInsertSingleWithRelationsStep before finalizing');
    }
    const {text} = this.finalizeResults;
  }

  public finalize(): void {
    if (!this.isFinalized) {
      this.locked = true;
      const resourceSource = this.resource.from;
      if (!sql.isSQL(resourceSource)) {
        throw new Error(
          `Error in ${this}: can only insert into sources defined as SQL, however ${
            this.resource
          } has ${inspect(resourceSource)}`
        );
      }
      const table = sql`${resourceSource} as ${this.alias}`;
    }
  }
}
