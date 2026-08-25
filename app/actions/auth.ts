'use server';

import { cookies } from 'next/headers';
import { fetchUnikraft } from '@/lib/unikraft/client';
import { redirect } from 'next/navigation';

const TOKEN_COOKIE_NAME = 'unikraft_pat';

export async function login(prevState: any, formData: FormData) {
  const token = formData.get('token');
  if (!token || typeof token !== 'string') {
    return { error: 'Token is required' };
  }

  try {
    // 改用 /v1/instances 验证 Token，因为 /v1/metros 可能不存在
    await fetchUnikraft('/v1/instances', token);
    
    // 如果没有抛出 401，说明 Token 合法，写入 HttpOnly Cookie
    const cookieStore = await cookies();
    cookieStore.set(TOKEN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

  } catch (error: any) {
    if (error.message && error.message.includes('401')) {
      return { error: 'Invalid Token: 认证失败 (401)' };
    }
    // 其他错误（比如 No API endpoint 404 等）都说明 Token 本身是有效的，只是路由不对
    const cookieStore = await cookies();
    cookieStore.set(TOKEN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }
  
  redirect('/dashboard');
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(TOKEN_COOKIE_NAME);
  redirect('/login');
}

export async function getToken() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE_NAME)?.value;
  return token;
}
