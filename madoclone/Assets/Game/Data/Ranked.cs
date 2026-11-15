using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Mado.Data
{
    /// <summary>
    /// ランク（0〜2）で変わる値。JSON の「数値1つ」（変わらない値）と「長さ3の配列」（凸で変わる値）を、
    /// 読み込み時に必ず3つの値に広げて持つ。不変。
    /// </summary>
    [JsonConverter(typeof(RankedConverter))]
    public sealed class Ranked<T>
    {
        public T R0 { get; }
        public T R1 { get; }
        public T R2 { get; }

        public Ranked(T r0, T r1, T r2)
        {
            R0 = r0;
            R1 = r1;
            R2 = r2;
        }

        /// <summary>全ランクで同じ値。</summary>
        public static Ranked<T> Of(T value)
        {
            return new Ranked<T>(value, value, value);
        }

        /// <summary>rank は 0〜2。</summary>
        public T Pick(int rank)
        {
            switch (rank)
            {
                case 0: return R0;
                case 1: return R1;
                case 2: return R2;
                default: throw new ArgumentOutOfRangeException(nameof(rank), rank, "ランクは0〜2");
            }
        }
    }

    /// <summary>
    /// Ranked&lt;T&gt; の JSON コンバーター。数値1つ（など1つの値）なら3つに複製、長さ3の配列ならそのまま、それ以外は例外。
    /// 要素の型が配列のとき（Ranked&lt;Element[]&gt;）は、「配列の配列」だけをランクの形とみなし、
    /// 文字列の配列は1つの値として3つに複製する。
    /// </summary>
    public sealed class RankedConverter : JsonConverter
    {
        public override bool CanConvert(Type objectType)
        {
            return objectType.IsGenericType && objectType.GetGenericTypeDefinition() == typeof(Ranked<>);
        }

        public override bool CanWrite
        {
            get { return false; }
        }

        public override object ReadJson(JsonReader reader, Type objectType, object existingValue, JsonSerializer serializer)
        {
            if (reader.TokenType == JsonToken.Null)
            {
                return null;
            }
            string path = reader.Path;
            Type elementType = objectType.GetGenericArguments()[0];
            JToken token = JToken.Load(reader);
            try
            {
                if (IsRankedForm(token, elementType))
                {
                    var array = (JArray)token;
                    if (array.Count != 3)
                    {
                        throw new JsonSerializationException(path + ": ランクで変わる値は長さ3の配列で書く（今は長さ " + array.Count + "）");
                    }
                    object a = array[0].ToObject(elementType, serializer);
                    object b = array[1].ToObject(elementType, serializer);
                    object c = array[2].ToObject(elementType, serializer);
                    return Activator.CreateInstance(objectType, a, b, c);
                }
                object v = token.ToObject(elementType, serializer);
                return Activator.CreateInstance(objectType, v, v, v);
            }
            catch (JsonException ex) when (!(ex.Message.StartsWith(path, StringComparison.Ordinal)))
            {
                throw new JsonSerializationException(path + ": " + ex.Message, ex);
            }
        }

        public override void WriteJson(JsonWriter writer, object value, JsonSerializer serializer)
        {
            throw new NotSupportedException("Ranked は読み込み専用");
        }

        private static bool IsRankedForm(JToken token, Type elementType)
        {
            if (token.Type != JTokenType.Array)
            {
                return false;
            }
            if (!elementType.IsArray)
            {
                return true;
            }
            var array = (JArray)token;
            return array.Count > 0 && array[0].Type == JTokenType.Array;
        }
    }
}
