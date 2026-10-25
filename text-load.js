export function createLatestTextLoader(onLoad, onError) {
  let revision = 0;

  return {
    invalidate() {
      revision += 1;
      return revision;
    },

    async load(readText, filename) {
      const requestRevision = ++revision;
      let text;
      try {
        text = await readText();
      } catch (error) {
        if (requestRevision === revision) onError(filename, error);
        return false;
      }

      if (requestRevision !== revision) return false;
      onLoad(text, filename);
      return true;
    },
  };
}
