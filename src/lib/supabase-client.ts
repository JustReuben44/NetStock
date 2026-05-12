import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase =
    createClient("https://wdgwdsvfhjtoiedjcrkc.supabase.co",
    "sb_publishable_wjrna4_5pyGwiAz1UAefqQ_TuEbqxlq");

