/**
 * ログインページ（設計 Auth デザイン）。
 *
 * WHY: フォーム＝全画面の分割レイアウト（LoginForm が自前で描画）。Server Component は
 * それを載せるだけ。認証操作は LoginForm(Client) が next-auth に接続する。
 */
import { LoginForm } from './login-form';

export default function LoginPage() {
  return <LoginForm />;
}
