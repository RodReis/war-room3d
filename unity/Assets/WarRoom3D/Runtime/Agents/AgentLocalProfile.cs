using System;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;

namespace WarRoom3D
{
    // Preferência visual local. A chave inclui o projeto e a sessão; nenhum dado é enviado à fonte.
    [Serializable]
    public sealed class AgentLocalProfile
    {
        public string alias;
        public int style;

        public static readonly string[] Styles = {
            "Feminina · casaco âmbar", "Masculina · colete ciano",
            "Feminina · jaqueta violeta", "Masculina · uniforme verde"
        };

        public static AgentLocalProfile Load(string projectId, string sessionKey, string agentKey)
        {
            var key = Key(projectId, sessionKey, agentKey);
            if (PlayerPrefs.HasKey(key))
            {
                try
                {
                    var saved = JsonUtility.FromJson<AgentLocalProfile>(PlayerPrefs.GetString(key));
                    if (saved != null && saved.style >= 0 && saved.style < Styles.Length)
                    {
                        saved.alias = NormalizeAlias(saved.alias);
                        return saved;
                    }
                }
                catch (ArgumentException) { /* Preferência corrompida: usar padrão determinístico. */ }
            }
            return new AgentLocalProfile { alias = "", style = (int)(StableHash(projectId + ":" + sessionKey + ":" + agentKey) % Styles.Length) };
        }

        public static void Save(string projectId, string sessionKey, string agentKey, string alias, int style)
        {
            if (style < 0 || style >= Styles.Length) throw new ArgumentOutOfRangeException(nameof(style));
            var value = new AgentLocalProfile { alias = NormalizeAlias(alias), style = style };
            PlayerPrefs.SetString(Key(projectId, sessionKey, agentKey), JsonUtility.ToJson(value));
            PlayerPrefs.Save();
        }

        public static void Clear(string projectId, string sessionKey, string agentKey)
        {
            PlayerPrefs.DeleteKey(Key(projectId, sessionKey, agentKey));
            PlayerPrefs.Save();
        }

        private static string NormalizeAlias(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "";
            var builder = new StringBuilder();
            foreach (var character in value.Trim())
                if (!char.IsControl(character)) builder.Append(character);
            return builder.ToString().Length > 40 ? builder.ToString().Substring(0, 40) : builder.ToString();
        }

        private static string Key(string projectId, string sessionKey, string agentKey)
        {
            if (string.IsNullOrEmpty(projectId) || string.IsNullOrEmpty(sessionKey) || string.IsNullOrEmpty(agentKey))
                throw new ArgumentException("Identidade de agente incompleta");
            using (var sha = SHA256.Create())
            {
                var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(projectId + "\0" + sessionKey + "\0" + agentKey));
                return "wr3d.agent.v1." + BitConverter.ToString(bytes).Replace("-", "");
            }
        }

        private static uint StableHash(string value)
        {
            uint hash = 2166136261;
            foreach (var character in value) hash = (hash ^ character) * 16777619;
            return hash;
        }
    }
}
