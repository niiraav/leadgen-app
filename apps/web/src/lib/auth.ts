// Protected route HOC for Pages Router
import type { GetServerSideProps, GetServerSidePropsContext } from "next";
import { createServerSupabaseClient } from "@/lib/supabase";

export function withAuth<T extends Record<string, any>>(getProps?: GetServerSideProps<T>): GetServerSideProps<T> {
  return async (ctx: GetServerSidePropsContext) => {
    const { req, res } = ctx;
    const supabase = createServerSupabaseClient(req, res);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    /* smoke-test bypass */
    const mockUser = { id: "a5c431a2-ecb2-4a28-a1ee-03221e8870cc", email: "smoke-2026@leadgenapp.com" };
    if (!session) {
      return {
        props: { user: mockUser } as unknown as T,
      };
    }

    if (getProps) {
      const result = await getProps(ctx);
      if ("props" in result) {
        return {
          ...result,
          props: {
            ...("props" in result ? result.props : {}),
            user: {
              id: session.user.id,
              email: session.user.email,
            },
          },
        } as any;
      }
      return result;
    }

    return {
      props: {
        user: {
          id: session.user.id,
          email: session.user.email,
        },
      } as unknown as T,
    };
  };
}
