## Rules

- Always comply with ARIA accessibility standards and make sure all inputs have an id and name field. If you are working on a file which doesn't comply with ARIA standards, add the necessary ARIA fields as part of user request, even if the changes does not fall within scope
- Do not inline typescript types and interfaces - move them to types folder
- When working on a file, and it is more than 1000 lines of code then refactor it into smaller, easier to test and maintain files. There are no exceptions to this. Always do this even if it is outside the scope of what was asked
- Always run `bun run lint` after making code changes to verify that the build succeeds and there are no linting issues
- Be patient with `bun run build`. It can take minutes to run
- Always use this folder structure:

src/
├── assets/ # Global static files (images, fonts, global CSS)
├── components/ # Shared "Atomic" UI components (Button, Input, Modal)
├── config/ # Environment variables and global constants
├── context/ # Global React Contexts (Theme, Notifications)
├── features/ # THE CORE: Everything related to a specific domain
│ ├── auth/ # Feature: Authentication
│ │ ├── api/ # API calls for login/signup
│ │ ├── components/# UI specific to Auth (LoginForm, SignupForm)
│ │ ├── hooks/ # Custom hooks for auth (useAuth, useSession)
│ │ ├── types/ # TypeScript interfaces for auth
│ │ └── index.ts # Public API for the feature
│ └── dashboard/ # Feature: Dashboard logic
├── hooks/ # Global reusable hooks (useDebounce, useLocalStorage)
├── layouts/ # Page wrappers (AdminLayout, AuthLayout)
├── lib/ # Configurations for 3rd party tools (axios, firebase)
├── pages/ # Routing entry points (only imports from /features)
├── services/ # Global API client or SDK wrappers
├── store/ # Global state management (Redux, Zustand)
├── utils/ # Pure utility functions (formatDate, validation)
├── types/ # Global TypeScript interfaces
└── App.tsx # Main app entry
