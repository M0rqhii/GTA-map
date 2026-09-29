// 80 colors: 16 hues x 5 tones (light -> dark). Must stay identical to private.palette() in
// supabase/migrations/0001_schema.sql (tests/lib.test.ts checks this).
export const PALETTE: readonly string[] = [
  '#fc9292', '#fcb292', '#fcca92', '#fce292', '#fcf392', '#eafc92', '#befc92', '#92fc9a',
  '#92fcc7', '#92fcea', '#92eefc', '#92d9fc', '#92befc', '#929afc', '#b992fc', '#f392fc',
  '#f65151', '#f68251', '#f6a951', '#f6cd51', '#f6e851', '#daf651', '#95f651', '#51f65e',
  '#51f6a3', '#51f6da', '#51e0f6', '#51bff6', '#5195f6', '#515ef6', '#8d51f6', '#e851f6',
  '#ed1d1d', '#ed5b1d', '#ed8c1d', '#edb91d', '#eddb1d', '#caed1d', '#73ed1d', '#1ded2e',
  '#1ded85', '#1dedca', '#1dd1ed', '#1da7ed', '#1d73ed', '#1d2eed', '#691ded', '#db1ded',
  '#bc1515', '#bc4715', '#bc6e15', '#bc9215', '#bcae15', '#a0bc15', '#5bbc15', '#15bc23',
  '#15bc69', '#15bca0', '#15a6bc', '#1584bc', '#155bbc', '#1523bc', '#5215bc', '#ae15bc',
  '#8a1414', '#8a3714', '#8a5314', '#8a6d14', '#8a8014', '#778a14', '#458a14', '#148a1e',
  '#148a4f', '#148a77', '#147b8a', '#14638a', '#14458a', '#141e8a', '#3f148a', '#80148a',
];

export const PALETTE_HUES = 16;
