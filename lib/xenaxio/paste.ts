// Files pasted from the clipboard (chat, step 61; comments and descriptions, step 134).

/**
 * Office apps put a picture of the copied text next to the text itself; then
 * the text is what the person wants. A screenshot or a copied image has no plain text.
 */
export function pastesAsText(types: readonly string[], files: File[]): boolean {
  return types.includes("text/plain") && types.includes("text/html") && files.every((f) => f.type.startsWith("image/"));
}

/** The files of a paste, or none when the paste is text (see pastesAsText). */
export function pastedFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = [...data.files];
  return files.length && !pastesAsText([...data.types], files) ? files : [];
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A screenshot comes as "image.png" every time; it gets the time instead, so the
 * record's files can be told apart. Files with a name of their own keep it.
 */
export function pastedName(file: File, now = new Date()): string {
  if (file.name && !/^image\.(png|jpe?g|gif|webp)$/i.test(file.name)) return file.name;
  const ext = (/^image\/(png|jpeg|gif|webp)$/.exec(file.type)?.[1] ?? "png").replace("jpeg", "jpg");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `image-${stamp}.${ext}`;
}
