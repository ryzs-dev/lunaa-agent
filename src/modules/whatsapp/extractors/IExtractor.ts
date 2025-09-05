export interface IExtractor<T> {
  extract(input: string): T | null;
}
