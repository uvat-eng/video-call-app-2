import { createFileRoute } from "@tanstack/react-router";
import LegalPage, { LEGAL, LegalSection } from "@/components/legal/LegalPage";

const TITLE = "Пользовательское соглашение RuChat";
const DESCRIPTION = "Правила использования мессенджера RuChat.";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage title="Пользовательское соглашение">
      <LegalSection title="1. Предмет соглашения">
        <p>
          {LEGAL.owner} предоставляет вам бесплатный доступ к мессенджеру {LEGAL.app} для обмена сообщениями,
          файлами, аудио- и видеозвонками. Регистрируясь, вы принимаете это соглашение и{" "}
          <a href="/privacy" className="font-medium underline">Политику конфиденциальности</a>.
        </p>
      </LegalSection>

      <LegalSection title="2. Аккаунт">
        <p>
          Для регистрации нужен номер телефона, имя и пароль. Вы отвечаете за сохранность пароля и
          PIN-кода и за действия, совершённые с вашего аккаунта. Один номер — один аккаунт.
        </p>
      </LegalSection>

      <LegalSection title="3. Запрещено">
        <ul className="list-disc space-y-2 pl-5">
          <li>распространять материалы, запрещённые законодательством РФ;</li>
          <li>рассылать спам и массовые сообщения без согласия получателей;</li>
          <li>выдавать себя за других людей и организации;</li>
          <li>распространять вредоносные программы и пытаться нарушить работу сервиса;</li>
          <li>оскорблять, угрожать и преследовать других пользователей.</li>
        </ul>
        <p>При нарушении правил доступ к аккаунту может быть ограничен.</p>
      </LegalSection>

      <LegalSection title="4. Шифрование и ответственность">
        <p>
          Переписка защищена сквозным шифрованием, поэтому мы не видим содержимое сообщений и не можем
          восстановить его при потере устройства. Делайте резервные копии в настройках. Пользователь сам
          отвечает за содержание своих сообщений.
        </p>
      </LegalSection>

      <LegalSection title="5. Доступность сервиса">
        <p>
          Сервис предоставляется «как есть». Мы стараемся обеспечить его бесперебойную работу, но не
          гарантируем отсутствие сбоев и можем проводить технические работы.
        </p>
      </LegalSection>

      <LegalSection title="6. Удаление аккаунта">
        <p>
          Вы можете прекратить пользоваться сервисом в любой момент. Для удаления аккаунта напишите на{" "}
          <a href={`mailto:${LEGAL.email}`} className="font-medium underline">{LEGAL.email}</a>.
        </p>
      </LegalSection>

      <LegalSection title="7. Изменения">
        <p>
          Мы можем изменять соглашение; новая редакция действует с момента публикации на этой странице.
          Продолжая пользоваться сервисом, вы соглашаетесь с изменениями.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
