import type { GraphQLSchema } from "graphql";
import {
  parse,
  buildASTSchema,
  printSchema,
  lexicographicSortSchema,
} from "graphql";

export function printOrderedSchema(originalSchema: GraphQLSchema): string {
  // Clone schema so we don't damage anything
  const schema = buildASTSchema(parse(printSchema(originalSchema)));

  const sorted = lexicographicSortSchema(schema);

  return printSchema(sorted);
}
