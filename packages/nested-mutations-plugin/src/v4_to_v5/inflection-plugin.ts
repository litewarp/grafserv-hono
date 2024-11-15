export const PgNestedMutationsInflectionPlugin: GraphileConfig.Plugin = {
  name: 'PgNestedMutationsInitPlugin',
  description:
    'Gathers the data and creates the input types for the nested mutations plugin',
  version: '0.0.1',

  inflection: {
    add: {
      // graphql typename for input object type
      nestedConnectorFieldType(_options, details) {
        const {isReverse, leftTable, localAttributes, remoteAttributes, rightTable} =
          details;
        // name for the Input Object
        // e.g., SessionUserIdFkeyInput for user object in SessionInput
        // e.g., SessionUserIdFkeyInverseInput for session object in UserInput

        // If leftTable contains foreign key
        // leftTableType + leftTable_attributes + Fkey + Input

        // if righTable contains foreign key
        // rightTable + rightTable_attributes + Fkey + input

        return this.upperCamelCase(
          [
            this.tableFieldName(isReverse ? rightTable : leftTable),
            [...(isReverse ? remoteAttributes : localAttributes)],
            'fKey',
            isReverse ? 'inverse' : null,
            'input',
          ]
            .filter(Boolean)
            .join('_')
        );
      },
      // fieldname to add to the left table
      nestedConnectorFieldName(_options, details) {
        const {
          leftTable,
          rightTable,
          localAttributes,
          remoteAttributes,
          isUnique,
          isReverse,
        } = details;

        const tableFieldName = this.tableFieldName(rightTable);

        const multipleFks = Object.keys(leftTable.getRelations()).length > 1;

        const computedReverseMutationName = this.camelCase(
          isUnique ? tableFieldName : this.pluralize(tableFieldName)
        );

        if (!isReverse) {
          return this.camelCase(`${tableFieldName}_to_${localAttributes.join('_and_')}`);
        }

        if (!multipleFks) {
          return this.camelCase(
            `${computedReverseMutationName}_using_${localAttributes.join('_and_ ')}`
          );
        }

        return this.camelCase(
          `${computedReverseMutationName}_to_${localAttributes.join(
            '_and_'
          )}_using_${remoteAttributes.join('_and_')}`
        );
      },
      nestedConnectByNodeIdFieldName(_options) {
        return this.camelCase(`connect_by_${this.nodeIdFieldName()}`);
      },
      nestedConnectByNodeIdInputType(_options, {rightTable}) {
        const rightTableFieldName = this.tableFieldName(rightTable);
        return this.upperCamelCase(`${rightTableFieldName}_node_id_connect`);
      },
      nestedConnectByKeyInputType(_options, relationship) {
        // to do - allow overriding of names through tags
        const {leftTable, localUnique, tableFieldName} = relationship;

        const attributes = localUnique.attributes.map((attributeName) =>
          this.attribute({attributeName, codec: leftTable.codec})
        );

        const keyName = localUnique.isPrimary ? 'pk' : attributes.join('_');

        return this.upperCamelCase(`${tableFieldName}_${keyName}_connect`);
      },
      nestedConnectByKeyFieldName(_options, relationship) {
        const {leftTable, localUnique} = relationship;

        const attributes = localUnique.attributes.map((attributeName) =>
          this.attribute({attributeName, codec: leftTable.codec})
        );

        return this.camelCase(`connect_by_${attributes.join('_and_')}`);
      },
      nestedCreateFieldName(_options) {
        return 'create';
      },
      nestedCreateInputType(_options, details) {
        // Same as fieldType except no 'inverse' and then add rightTableName + 'create'
        const {leftTable, rightTable, localAttributes, remoteAttributes, isReverse} =
          details;

        return this.upperCamelCase(
          [
            this.tableFieldName(isReverse ? rightTable : leftTable),
            [...(isReverse ? remoteAttributes : localAttributes)],
            'fkey',
            this.tableFieldName(rightTable),
            'create',
            'input',
          ]
            .filter(Boolean)
            .join('_')
        );
      },
      nestedUpdateByNodeIdFieldName(_options) {
        return this.camelCase(`update_by_${this.nodeIdFieldName()}`);
      },
      nestedUpdateByNodeIdInputType(
        _options,
        {rightTable, tableFieldName, isReverse, localAttributes, remoteAttributes}
      ) {
        const rightTableFieldName = this.tableFieldName(rightTable);

        const constraintName = isReverse
          ? [rightTableFieldName, ...remoteAttributes]
          : [tableFieldName, ...localAttributes];

        return this.upperCamelCase(
          [
            rightTableFieldName,
            'on',
            tableFieldName,
            'for',
            ...constraintName,
            'node',
            'id',
            'update',
          ].join('_')
        );
      },
      nestedUpdateByKeyFieldName(_options, _relationship) {
        return '';
      },
      nestedUpdateByKeyInputType(_options, _relationship) {
        return '';
      },
      nestedUpdatePatchType(_options, _relationship) {
        return '';
      },
      nestedDeleteByNodeIdFieldName(_options) {
        return this.camelCase(`delete_by_${this.nodeIdFieldName()}`);
      },
      nestedDeleteByKeyFieldName(_options) {
        return '';
      },
      nestedDeleteByNodeIdInputType(_options, {leftTable}) {
        return this.upperCamelCase(`${this.tableFieldName(leftTable)}_node_id_delete`);
      },
      nestedDeleteByKeyInputType(_options) {
        return '';
      },
    },
  },
};
