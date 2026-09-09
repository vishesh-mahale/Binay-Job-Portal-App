const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

sb.from('users')
  .select('id, email, role, full_name, created_at')
  .order('created_at')
  .then(({ data, error }) => {
    if (error) { console.error(error); process.exit(1); }
    console.log(JSON.stringify(data, null, 2));
  });
