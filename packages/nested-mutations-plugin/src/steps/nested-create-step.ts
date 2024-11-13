import type {PgCodec} from '@dataplan/pg';
import type {PgTableResource} from '@graphile-contrib/pg-many-to-many';
import {constantCase} from 'graphile-build';
import type {ExecutableStep} from 'postgraphile/grafast';
import {type SQL, sql} from 'postgraphile/pg-sql2';
import {inspect} from '../helpers.ts';
import {withPgClientResource} from './with-pgclient-resource.ts';

export function nestedCreateStep(
  rightTable: PgTableResource,
  args: ExecutableStep
) {
  return withPgClientResource(
    rightTable,
    args,
    async (client, data, {attributes, values: addedVals}) => {
      const resourceSource = rightTable.from;

      if (!sql.isSQL(resourceSource)) {
        throw new Error(
          `Error in nested create field: can only insert into resources defined as SQL, however ${rightTable.name} has ${inspect(resourceSource)}`
        );
      }

      const name = rightTable.name;
      const symbol = Symbol(name);
      const alias = sql.identifier(symbol);
      const table = sql`${resourceSource} as ${alias}`;
      const attrs: SQL[] = [];
      const vals: SQL[] = [];
      const sels = new Map<string, PgCodec>();

      // create the selection set
      for (const attrib of attributes) {
        const codec = rightTable.codec.attributes[attrib]?.codec;
        if (!codec) {
          throw new Error(
            `Could not find codec for attribute ${attrib} on ${rightTable.name}`
          );
        }

        // add it to the selection set if not already there
        if (!sels.has(attrib)) {
          sels.set(attrib, codec);
        }
      }

      Object.entries(data).forEach(([k, v]) => {
        // this is a hack for now
        const snaked = constantCase(k).toLowerCase();

        if (v && addedVals.find(([key, _]) => key === snaked)) {
          console.warn(
            `Passed both a step for attribute ${snaked} and a value on the insert objection for it. Defaulting to the value resolved from the step`
          );
          return;
        }

        // skip the non-node-id if enabled (e.g., "rowId")
        const codec = rightTable.codec.attributes[snaked]?.codec;
        if (k === 'rowId' || !v || !codec) {
          return;
        }

        // create the sql values for insert
        attrs.push(sql.identifier(snaked));
        vals.push(sql`${sql.value(codec.toPg(v))}::${codec.sqlType}`);
      });

      for (const [k, v] of addedVals) {
        // add any values added by steps
        const codec = rightTable.codec.attributes[k]?.codec;
        if (!codec) {
          throw new Error(
            `Could not find codec for attribute ${k} on ${rightTable.name}`
          );
        }
        if (v) {
          attrs.push(sql.identifier(k));
          vals.push(sql`${sql.value(codec.toPg(v))}::${codec.sqlType}`);
        }
      }

      const frags = [...sels].map(([name, codec]) => {
        const ident = codec.castFromPg
          ? codec.castFromPg(sql.identifier(name))
          : sql.identifier(String(name));
        const frag = sql`${alias}.${ident}`;
        return sql`${frag} as ${ident}`;
      });

      const returning =
        frags.length > 0
          ? sql`returning\n${sql.indent(sql.join(frags, ',\n'))}`
          : sql.blank;

      const insertedAttrs = sql.join(attrs, ', ');
      const values = sql.join(vals, ', ');

      const query = sql`insert into ${table} (${insertedAttrs}) values (${values})${returning}`;

      const res = await client
        .withTransaction((tx) =>
          tx.query({
            ...sql.compile(query),
          })
        )
        .then((res) => res.rows[0] ?? Object.create(null));

      return res;
    }
  );
}
