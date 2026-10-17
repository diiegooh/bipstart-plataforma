import { createClient } from "npm:@supabase/supabase-js@2";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
  "cache-control": "no-store",
};
function response(status: number, message: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ message, ...extra }), {
    status, headers: { ...cors, "content-type": "application/json; charset=utf-8" },
  });
}
function brazilPhone(input: unknown) {
  let digits = String(input ?? "").replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(digits)) digits = digits.slice(2);
  if (!/^[1-9]\d{9,10}$/.test(digits)) throw new Error("Informe um telefone brasileiro com DDD.");
  return { local: digits, email: "courier-55" + digits + "@login.bipstart.example" };
}
function securePassword(value: unknown, required: boolean) {
  const pass = typeof value === "string" ? value : "";
  if (!pass && !required) return null;
  if (pass.length < 8 || pass.length > 72)
    throw new Error("A senha deve ter entre 8 e 72 caracteres.");
  return pass;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return response(405, "Método não permitido.");
  const auth = request.headers.get("Authorization") || "";
  if (!/^Bearer \S+$/i.test(auth)) return response(401, "Entre na conta da loja.");
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) return response(503, "Configuração segura indisponível.");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    if (Number(request.headers.get("content-length") || 0) > 4096)
      return response(413, "Dados excedem o limite permitido.");
    const token = auth.replace(/^Bearer /i, "");
    const { data: account, error: accountError } = await db.auth.getUser(token);
    if (accountError || !account?.user?.id) return response(401, "Sessão inválida.");
    const data = await request.json();
    const shopId = String(data?.shop_id || "");
    const action = String(data?.action || "");
    if (!uuid.test(shopId) || !["create", "provision", "update", "remove"].includes(action))
      return response(400, "Solicitação inválida.");

    // Autorização por loja e plano, nunca somente por ID enviado no navegador.
    const { data: shop, error: shopErr } = await db.from("shops")
      .select("id,owner_id").eq("id", shopId).maybeSingle();
    if (shopErr || !shop || shop.owner_id !== account.user.id)
      return response(403, "Somente o proprietário pode cadastrar este motoboy.");
    const { data: entitlement, error: entErr } = await db.from("shop_entitlements")
      .select("plan_code,status,trial_until,active_until").eq("shop_id", shopId).maybeSingle();
    const now = Date.now();
    const active = entitlement && entitlement.plan_code === "pro" && (
      (entitlement.status === "trialing" && Date.parse(entitlement.trial_until) > now) ||
      (entitlement.status === "active" &&
        (!entitlement.active_until || Date.parse(entitlement.active_until) > now)));
    if (entErr || !active) return response(403, "O cadastro de motoboys exige Premium vigente.");

    if (action === "remove") {
      const courierId = String(data?.courier_id || "");
      if (!uuid.test(courierId)) return response(400, "Motoboy inválido.");
      const { data: courier, error: courierError } = await db.from("shop_couriers")
        .select("id,account_id,login_managed,removed_at").eq("id",courierId)
        .eq("shop_id",shopId).maybeSingle();
      if (courierError || !courier || courier.removed_at)
        return response(404, "Motoboy não encontrado.");
      const { data: ongoing, error: deliveryError } = await db.from("shop_deliveries")
        .select("id").eq("shop_id",shopId).eq("courier_id",courierId)
        .in("status",["atribuida","a_caminho"]).limit(1);
      if (deliveryError) return response(500,"Não foi possível verificar entregas em andamento.");
      if (ongoing?.length) return response(409,"Este motoboy possui entrega em andamento. Conclua ou redistribua antes de remover.");
      const { error: removalError } = await db.from("shop_couriers")
        .update({ active:false,removed_at:new Date().toISOString(),invite_code:null })
        .eq("id",courierId).eq("shop_id",shopId).is("removed_at",null);
      if (removalError) return response(500,"Não foi possível remover o motoboy.");
      // Bloqueia credenciais criadas e gerenciadas exclusivamente pela loja.
      if (courier.login_managed && courier.account_id) {
        const { error: banError } = await db.auth.admin.updateUserById(
          courier.account_id,{ ban_duration:"876000h" }
        );
        if (banError) return response(500,"Motoboy removido, mas o bloqueio do login exige revisão administrativa.");
      }
      return response(200,"Motoboy removido. Histórico preservado.");
    }

    const name = String(data?.name ?? "").trim();
    const phone = brazilPhone(data?.phone);
    const password = securePassword(data?.password, action !== "update");
    if (name.length < 2 || name.length > 100)
      return response(400, "Informe um nome válido de até 100 caracteres.");
    if (typeof data?.active !== "boolean") return response(400, "Disponibilidade inválida.");

    const courierId = String(data?.courier_id || "");
    if (action !== "create" && !uuid.test(courierId))
      return response(400, "Identificador do motoboy inválido.");
    let courier: { id: string; account_id: string | null; login_managed: boolean } | null = null;
    if (action !== "create") {
      const { data: found, error } = await db.from("shop_couriers")
        .select("id,account_id,login_managed").eq("id",courierId).eq("shop_id",shopId).maybeSingle();
      if (error || !found) return response(404, "Motoboy não encontrado nesta loja.");
      courier = found;
      if (action === "provision" && courier.account_id)
        return response(409, "Este motoboy já possui acesso.");
      if (action === "update" && (!courier.login_managed || !courier.account_id))
        return response(409, "Este acesso foi criado por convite e deve manter seu próprio login.");
    }

    if (action === "update") {
      const updateAuth: { email: string; email_confirm: boolean; password?: string } = {
        email: phone.email, email_confirm: true,
      };
      if (password) updateAuth.password = password;
      const { error: authError } = await db.auth.admin.updateUserById(
        courier!.account_id!, updateAuth,
      );
      if (authError) return response(409, "Não foi possível alterar o login: " + authError.message);
      const { error } = await db.from("shop_couriers")
        .update({ name, phone: phone.local, active: data.active })
        .eq("id", courierId).eq("shop_id", shopId).eq("account_id", courier!.account_id);
      if (error) return response(500, "Login alterado; não foi possível atualizar o cadastro. Tente novamente.");
      return response(200, "Login e cadastro atualizados.", { courier_id: courierId, login: phone.local });
    }

    // A senha pertence exclusivamente ao GoTrue/Supabase Auth (hash protegido).
    // Nunca salvar password em shop_couriers, logs ou resposta.
    const { data: created, error: authError } = await db.auth.admin.createUser({
      email: phone.email, password: password!, email_confirm: true,
    });
    if (authError || !created?.user) {
      return response(409, "Não foi possível criar o login. Telefone já usado ou senha inválida.");
    }
    let resultId: string | undefined;
    let storeError = "";
    try {
      if (action === "create") {
        const { data: row, error } = await db.from("shop_couriers").insert({
          shop_id: shopId, name, phone: phone.local, active: data.active,
          account_id: created.user.id, login_managed: true, invite_code: null,
        }).select("id").single();
        if (error || !row) throw new Error("Não foi possível salvar o motoboy.");
        resultId = row.id;
      } else {
        const { data: row, error } = await db.from("shop_couriers").update({
          name, phone: phone.local, active: data.active,
          account_id: created.user.id, login_managed: true, invite_code: null,
        }).eq("id", courierId).eq("shop_id", shopId).is("account_id",null)
          .select("id").single();
        if (error || !row) throw new Error("Não foi possível vincular o login.");
        resultId = row.id;
      }
    } catch (e) {
      storeError = e instanceof Error ? e.message : "Erro ao salvar motoboy.";
    }
    if (!resultId) {
      await db.auth.admin.deleteUser(created.user.id);
      return response(500, storeError || "Cadastro não concluído.");
    }
    return response(200, "Acesso do motoboy criado.", {
      courier_id: resultId, login: phone.local,
    });
  } catch (error) {
    // Nunca colocar o objeto recebido nem passwords no log.
    const description = error instanceof Error ? error.message : "Falha de validação.";
    return response(400, description);
  }
});
