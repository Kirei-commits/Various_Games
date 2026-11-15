// C# 9 の init アクセサを netstandard2.1 で使うための定義（コンパイラが探す型）。
// Data アセンブリの中だけで使う。Core には置かない：tools/Mado.CoreLib は Data と Core を1つにまとめてコンパイルするので、
// Core にも置くと型が二重になる。Core のクラスは init を使わず、コンストラクタと読み取り専用で書く。
namespace System.Runtime.CompilerServices
{
    internal static class IsExternalInit
    {
    }
}
