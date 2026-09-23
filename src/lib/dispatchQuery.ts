interface QueryResult {
  error: { message: string } | null;
}

export const dispatchQuery = (query: PromiseLike<QueryResult>, label: string): void => {
  Promise.resolve(query).then(
    ({ error }) => {
      if (error) console.error(`[${label}] ${error.message}`);
    },
    (err) => console.error(`[${label}]`, err),
  );
};
