using System;
using System.Collections.Generic;
using System.Reflection;
using System.Runtime.Serialization;
using Newtonsoft.Json;

namespace Mado.Data
{
    /// <summary>
    /// 列挙型を JSON の文字列と1対1で読み書きする。綴りは EnumMember の Value（無ければ名前の先頭を小文字にしたもの）。
    /// 未知の綴り・数値・null（null を許さない型のとき）は JsonSerializationException（DataLoader が DataIssue に直す）。
    /// </summary>
    public sealed class EnumStringConverter : JsonConverter
    {
        private sealed class EnumMap
        {
            public readonly Dictionary<string, object> FromText = new Dictionary<string, object>();
            public readonly Dictionary<object, string> ToText = new Dictionary<object, string>();
        }

        private static readonly Dictionary<Type, EnumMap> Maps = new Dictionary<Type, EnumMap>();

        public override bool CanConvert(Type objectType)
        {
            Type t = Nullable.GetUnderlyingType(objectType) ?? objectType;
            return t.IsEnum;
        }

        /// <summary>列挙値の JSON での綴り。</summary>
        public static string Text(object enumValue)
        {
            if (enumValue == null)
            {
                throw new ArgumentNullException(nameof(enumValue));
            }
            EnumMap map = GetMap(enumValue.GetType());
            return map.ToText[enumValue];
        }

        /// <summary>JSON の綴りから列挙値を得る。知らない綴りは DataException。</summary>
        public static T Parse<T>(string text) where T : struct
        {
            EnumMap map = GetMap(typeof(T));
            object value;
            if (text == null || !map.FromText.TryGetValue(text, out value))
            {
                throw new DataException("未知の値 \"" + text + "\"（" + typeof(T).Name + "）");
            }
            return (T)value;
        }

        public override object ReadJson(JsonReader reader, Type objectType, object existingValue, JsonSerializer serializer)
        {
            Type enumType = Nullable.GetUnderlyingType(objectType) ?? objectType;
            if (reader.TokenType == JsonToken.Null)
            {
                if (enumType == objectType)
                {
                    throw new JsonSerializationException(reader.Path + ": null は書けない（" + enumType.Name + "）");
                }
                return null;
            }
            if (reader.TokenType != JsonToken.String)
            {
                throw new JsonSerializationException(reader.Path + ": 文字列で書く（" + enumType.Name + "）");
            }
            string text = (string)reader.Value;
            EnumMap map = GetMap(enumType);
            object value;
            if (!map.FromText.TryGetValue(text, out value))
            {
                throw new JsonSerializationException(reader.Path + ": 未知の値 \"" + text + "\"（" + enumType.Name + "）");
            }
            return value;
        }

        public override void WriteJson(JsonWriter writer, object value, JsonSerializer serializer)
        {
            if (value == null)
            {
                writer.WriteNull();
                return;
            }
            writer.WriteValue(Text(value));
        }

        private static EnumMap GetMap(Type enumType)
        {
            lock (Maps)
            {
                EnumMap map;
                if (Maps.TryGetValue(enumType, out map))
                {
                    return map;
                }
                map = new EnumMap();
                foreach (FieldInfo field in enumType.GetFields(BindingFlags.Public | BindingFlags.Static))
                {
                    object value = field.GetValue(null);
                    string text = null;
                    object[] attrs = field.GetCustomAttributes(typeof(EnumMemberAttribute), false);
                    if (attrs.Length > 0)
                    {
                        text = ((EnumMemberAttribute)attrs[0]).Value;
                    }
                    if (string.IsNullOrEmpty(text))
                    {
                        text = char.ToLowerInvariant(field.Name[0]) + field.Name.Substring(1);
                    }
                    map.FromText[text] = value;
                    map.ToText[value] = text;
                }
                Maps[enumType] = map;
                return map;
            }
        }
    }
}
