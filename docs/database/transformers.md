# Column Transformers

Columns with special types must use transformers:
- Decimals use `decimalTransformer` to return `number`.
- Dates use `dateTransformer` to return `Date`.

Use these transformers on all decimal/date columns, including base columns.
