// Protected route HOC for Pages Router
import type { GetServerSideProps, GetServerSidePropsContext } from "next";
import { createServerSupabaseClient } from "@/lib/supabase";

export function withAuth<T>(getProps?: GetServerSideProps<T>): GetServerSideProps<T> {
  return async (ctx: GetServerSidePropsContext) => {
    const { req, res } = ctx;
    const supabase = createServerSupabaseClient(req, res);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return {
        redirect: {
          destination: "/auth/login",
          permanent: false,
        },
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
