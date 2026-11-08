using System.Collections.Generic;

namespace WarRoom3D
{
    public static class ReferenceRoomDemoAgents
    {
        public static List<AgentEntry> ForProject(DemoProject project)
        {
            var entries = new List<AgentEntry>();
            for (var i = 0; i < project.activeAgents; i++)
            {
                var label = "Agente " + (i + 1) + " · exemplo";
                var detail = "CONCEITO · dado ilustrativo. Nenhuma fonte ou sessão real vinculada. Tarefa: " + project.activity +
                    "\nFerramenta/skill: não disponíveis nesta fixture. Logs e último sinal: não observados.";
                if (project.projectId == "api-core")
                {
                    var role = i < 2 ? "Principal" : "Subagente";
                    var provider = i == 1 ? "Claude" : "Codex";
                    var state = i == 1 ? "Aguardando" : "Trabalhando";
                    label = role + " · " + provider + " · " + state;
                    detail = "CONCEITO · fixture sintética; nenhuma sessão real vinculada." +
                        "\nAgente: " + label + "\nTarefa: " + project.activity +
                        "\nFerramenta: terminal fictício · exemplo" +
                        "\nSkill: revisão de código · exemplo" +
                        "\nLog: 09:41 · atividade simulada; sem fonte operacional.";
                }
                entries.Add(new AgentEntry("exemplo-" + (i + 1), label, detail));
            }
            return entries;
        }
    }
}
