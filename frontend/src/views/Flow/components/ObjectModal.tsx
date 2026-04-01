import {
  Box,
  Modal,
  SpaceBetween,
  Spinner,
  TextContent,
} from "@cloudscape-design/components";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ValueWithLabel from "@/components/ValueWithLabel";
import { useObjects } from "@/hooks/useObjects";

type Props = {
  modalVisible: boolean;
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  objectId: string;
  setObjectId: React.Dispatch<React.SetStateAction<string>>;
};

const ObjectModal = ({
  modalVisible,
  setModalVisible,
  objectId,
  setObjectId,
}: Props) => {
  const { object, isLoading } = useObjects(objectId);
  const location = useLocation();
  const navigate = useNavigate();

  const handleDismiss = () => {
    setModalVisible(false);
    setObjectId("");
  };

  const handleLinkClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    path: string,
  ) => {
    e.preventDefault();
    setModalVisible(false);
    setObjectId("");
    navigate(path);
  };

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={modalVisible}
      header="Object Details"
    >
      {isLoading ? (
        <Spinner />
      ) : (
        <SpaceBetween size="l">
          <ValueWithLabel
            key="first_referenced_by_flow"
            label="First Referenced By Flow"
          >
            {object?.first_referenced_by_flow}
          </ValueWithLabel>
          <TextContent>
            <Box variant="awsui-key-label">Referenced By Flows</Box>
            <ul>
              {object?.referenced_by_flows.map((item) => {
                const itemPath = `/flows/${item}`;
                const isCurrentPath = location.pathname === itemPath;
                return (
                  <li key={item}>
                    {isCurrentPath ? (
                      item
                    ) : (
                      <Link
                        to={itemPath}
                        onClick={(e) => handleLinkClick(e, itemPath)}
                      >
                        {item}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </TextContent>
        </SpaceBetween>
      )}
    </Modal>
  );
};

export default ObjectModal;
