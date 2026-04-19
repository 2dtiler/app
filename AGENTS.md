# Rules

- Always run "bun run lint" after making changes and correct all the errors you see, even if it was not a direct issue caused by current code changes
- Always comply with ARIA accessibility standards and make sure all inputs have an id and name field. If you are working on a file which doesn't comply with ARIA standards, add the necessary ARIA fields as part of user request, even if the changes does not fall within scope
- Do not inline typescript types and interfaces - move them to /src/types/
- When working on a file, and it is more than 1000 lines of code then refactor it into smaller, easier to test and maintain files. There are no exceptions to this. Always do this even if it is outside the scope of what was asked
- Always run `bun run build` after making code changes to verify that the build succeeds
