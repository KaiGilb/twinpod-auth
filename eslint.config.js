export default [
  {
    files: ['src/**/*.js'],
    rules: {
      'no-unused-vars': 'error',
      'no-undef': 'error'
    },
    languageOptions: {
      // window and document are used in the auth composable for OIDC redirect handling
      globals: {
        window: 'readonly'
      }
    }
  }
]
