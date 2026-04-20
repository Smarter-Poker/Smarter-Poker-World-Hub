const targetPath = "27808-poker-strategy-with-jonathan-little-a-costly-preflop-mistake";
const slugMatch = targetPath.match(/^[0-9]+-(.+)$/);
const pureSlug = slugMatch ? slugMatch[1] : targetPath;
console.log(pureSlug);
